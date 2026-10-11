//! A shared-daemon client over the existing authenticated, generation-scoped SSH connection.
//! Requests are never retried after sending: a lost acknowledgement may represent a committed turn.
use super::*;
use crate::herdr_connection::ConnectionExecStream;
use futures::{SinkExt, StreamExt, stream::SplitSink};
use serde_json::{Value, json};
use std::collections::VecDeque;
use tokio::io::{AsyncReadExt, AsyncWriteExt, DuplexStream};
use tokio::sync::{mpsc, oneshot};
use tokio_tungstenite::{WebSocketStream, tungstenite::Message};

type Reply = oneshot::Sender<Result<Value, String>>;
static NEXT_CONNECTION: AtomicU64 = AtomicU64::new(1);

pub(super) struct CodexDaemon {
    id: u64,
    stream: Arc<ConnectionExecStream>,
    writer: AsyncMutex<SplitSink<WebSocketStream<DuplexStream>, Message>>,
    pending: Mutex<HashMap<String, Reply>>,
    requests: Mutex<HashMap<String, Value>>,
    events: Mutex<VecDeque<Value>>,
    error: Mutex<Option<String>>,
    sequence: AtomicU64,
    event_sequence: AtomicU64,
    tasks: Mutex<Vec<tokio::task::JoinHandle<()>>>,
}

impl Drop for CodexDaemon {
    fn drop(&mut self) {
        for task in self.tasks.get_mut().drain(..) {
            task.abort();
        }
        let _ = self.stream.close();
    }
}

impl CodexDaemon {
    fn fail(&self, reason: String) {
        *self.error.lock() = Some(reason.clone());
        for (_, reply) in self.pending.lock().drain() {
            let _ = reply.send(Err(reason.clone()));
        }
        let _ = self.stream.close();
    }

    fn current(&self) -> bool {
        self.stream.is_current() && self.error.lock().is_none()
    }

    async fn connect(
        connection: Arc<HerdrConnection>,
        runtime_id: String,
    ) -> Result<Arc<Self>, String> {
        // Start is idempotent and never restarts/upgrades an existing daemon. Its environment
        // must not claim a Herdr pane: this client is a conversation client, not a terminal.
        let command = crate::agent_sessions::opencode_login_command(
            r#"exec /bin/sh -c '
export PATH="$HOME/.local/bin:$HOME/.local/share/mise/shims:$HOME/.cargo/bin:$PATH"
if ! command -v codex >/dev/null 2>&1; then
  for p in "$HOME"/.nvm/versions/node/*/bin; do [ ! -x "$p/codex" ] || export PATH="$p:$PATH"; done
fi
unset HERDR_PANE_ID HERDR_SOCKET_PATH HERDR_ENV CODEX_THREAD_ID
codex app-server daemon start >/dev/null 2>&1 || exit 70
exec codex app-server proxy
'"#,
        );
        let (tx, mut incoming) = mpsc::channel::<Vec<u8>>(256);
        let (closed_tx, mut closed_rx) = watch::channel(false);
        let overflow = closed_tx.clone();
        let stream = connection
            .open_exec_stream(
                "codex",
                &command,
                Arc::new(move |data| {
                    if tx.try_send(data).is_err() {
                        overflow.send_replace(true);
                    }
                }),
                Arc::new(move |_| {
                    closed_tx.send_replace(true);
                }),
            )
            .await
            .map_err(|e| e.to_string())?;
        let (io, bridge) = tokio::io::duplex(128 * 1024);
        let (mut read, mut write) = tokio::io::split(bridge);
        let outgoing = stream.clone();
        let incoming_task = tokio::spawn(async move {
            while let Some(bytes) = incoming.recv().await {
                if write.write_all(&bytes).await.is_err() {
                    break;
                }
            }
        });
        let outgoing_task = tokio::spawn(async move {
            let mut buffer = vec![0; 32 * 1024];
            let mut check = tokio::time::interval(Duration::from_secs(1));
            loop {
                tokio::select! {
                    result = read.read(&mut buffer) => match result {
                        Ok(0) | Err(_) => break,
                        Ok(n) => if outgoing.write(buffer[..n].to_vec()).is_err() { break; },
                    },
                    _ = closed_rx.changed() => break,
                    _ = check.tick() => if !outgoing.is_current() { break; },
                }
            }
            let _ = outgoing.close();
        });
        let handshake = tokio::time::timeout(
            Duration::from_secs(40),
            tokio_tungstenite::client_async("ws://localhost/", io),
        )
        .await;
        let socket = match handshake {
            Ok(Ok((socket, _))) => socket,
            other => {
                incoming_task.abort();
                outgoing_task.abort();
                let _ = stream.close();
                return Err(format!(
                    "Could not connect to the Codex daemon. Check Codex installation and login. {other:?}"
                ));
            }
        };
        let (writer, mut reader) = socket.split();
        let client = Arc::new(Self {
            id: NEXT_CONNECTION.fetch_add(1, Ordering::Relaxed),
            stream,
            writer: AsyncMutex::new(writer),
            pending: Mutex::new(HashMap::new()),
            requests: Mutex::new(HashMap::new()),
            events: Mutex::new(VecDeque::new()),
            error: Mutex::new(None),
            sequence: AtomicU64::new(1),
            event_sequence: AtomicU64::new(0),
            tasks: Mutex::new(vec![incoming_task, outgoing_task]),
        });
        let weak = Arc::downgrade(&client);
        let task = tokio::spawn(async move {
            while let Some(frame) = reader.next().await {
                let Some(client) = weak.upgrade() else {
                    return;
                };
                match frame {
                    Ok(Message::Text(text)) => match serde_json::from_str::<Value>(&text) {
                        Ok(value) => client.receive(value),
                        Err(_) => {
                            client.fail("Codex returned invalid JSON".into());
                            return;
                        }
                    },
                    Ok(Message::Ping(bytes)) => {
                        let pong = tokio::time::timeout(Duration::from_secs(20), async {
                            client.writer.lock().await.send(Message::Pong(bytes)).await
                        })
                        .await;
                        if !matches!(pong, Ok(Ok(()))) {
                            client.fail("Codex connection stopped responding".into());
                            return;
                        }
                    }
                    Ok(Message::Close(_)) | Err(_) => break,
                    _ => {}
                }
            }
            if let Some(client) = weak.upgrade() {
                client.fail("Codex connection closed. Reconnect before continuing; an unacknowledged message is not resent.".into());
            }
        });
        client.tasks.lock().push(task);
        // Native wakeups keep event delivery alive when Android suspends JS timers.
        // No transcript or approval data crosses this callback; the client drains its queue.
        let weak = Arc::downgrade(&client);
        let wake = tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_millis(500));
            let mut previous = 0;
            let mut ticks = 0;
            loop {
                interval.tick().await;
                let Some(client) = weak.upgrade() else {
                    return;
                };
                ticks += 1;
                let sequence = client.event_sequence.load(Ordering::Acquire);
                if sequence != previous || ticks >= 20 || !client.current() {
                    previous = sequence;
                    ticks = 0;
                    emit(HostRuntimeEvent::CodexActivity {
                        runtime_id: runtime_id.clone(),
                    });
                }
                if !client.current() {
                    return;
                }
            }
        });
        client.tasks.lock().push(wake);
        client.request("initialize", json!({"clientInfo":{"name":"whip_chat","title":"Reins","version":"1.8.13"},"capabilities":{"experimentalApi":true}})).await?;
        client
            .send(json!({"method":"initialized","params":{}}))
            .await?;
        Ok(client)
    }

    fn receive(&self, mut value: Value) {
        if let Some(id) = value.get("id") {
            let key = id.to_string();
            if value.get("method").is_none() {
                if let Some(reply) = self.pending.lock().remove(&key) {
                    let result = value.get("error").map_or_else(|| Ok(json!({"result":value["result"],"eventCursor":self.event_sequence.load(Ordering::Acquire)})), |e| Err(e.to_string()));
                    let _ = reply.send(result);
                }
                return;
            }
            self.requests.lock().insert(key, value.clone());
        }
        if value["method"] == "serverRequest/resolved" {
            self.requests
                .lock()
                .remove(&value["params"]["requestId"].to_string());
        }
        value["_whipSeq"] = json!(self.event_sequence.fetch_add(1, Ordering::AcqRel) + 1);
        let overflow = {
            let mut events = self.events.lock();
            if events.len() >= 4096 {
                true
            } else {
                events.push_back(value);
                false
            }
        };
        if overflow {
            self.fail(
                "Codex event queue overflow; reconnect to refresh conversation history".into(),
            );
        }
    }

    async fn send(&self, message: Value) -> Result<(), String> {
        if !self.current() {
            return Err("Codex connection changed; reconnect before continuing".into());
        }
        let sent = tokio::time::timeout(Duration::from_secs(20), async {
            self.writer
                .lock()
                .await
                .send(Message::Text(message.to_string().into()))
                .await
        })
        .await
        .map_err(|_| "Codex send timed out; delivery is unknown".to_owned())
        .and_then(|result| result.map_err(|e| e.to_string()));
        if let Err(reason) = &sent {
            self.fail(reason.clone());
        }
        sent
    }

    async fn request(&self, method: &str, params: Value) -> Result<Value, String> {
        let id = format!(
            "whip-{}-{}",
            self.id,
            self.sequence.fetch_add(1, Ordering::Relaxed)
        );
        let key = json!(id).to_string();
        let (tx, rx) = oneshot::channel();
        self.pending.lock().insert(key.clone(), tx);
        let result = async {
            self.send(json!({"id":id,"method":method,"params":params})).await?;
            tokio::time::timeout(Duration::from_secs(60), rx).await
                .map_err(|_| "Codex request timed out. Delivery may have succeeded; inspect the conversation before retrying.".to_owned())?
                .map_err(|_| "Codex connection closed".to_owned())?
        }.await;
        self.pending.lock().remove(&key);
        result
    }
}

async fn call(
    inner: Arc<RuntimeInner>,
    operation: String,
    payload: Value,
) -> Result<Value, String> {
    let mut slot = inner.codex_daemon.lock().await;
    if operation == "close" {
        *slot = None;
        return Ok(Value::Null);
    }
    if let Some(expected) = payload.get("expectedConnectionId").and_then(Value::as_str)
        && !slot
            .as_ref()
            .is_some_and(|c| c.current() && c.id.to_string() == expected)
    {
        return Err("Codex connection changed before sending. Reconnect and inspect the conversation before retrying.".into());
    }
    // Poll/respond never silently replace the connection whose events or approval the UI saw.
    if operation != "request" && !slot.as_ref().is_some_and(|c| c.current()) {
        return Err("Codex disconnected; reconnect to refresh pending requests".into());
    }
    if !slot.as_ref().is_some_and(|c| c.current()) {
        *slot = None;
        *slot = Some(CodexDaemon::connect(inner.herdr.clone(), inner.id.clone()).await?);
    }
    let client = slot.as_ref().cloned().ok_or("Codex unavailable")?;
    drop(slot);
    match operation.as_str() {
        "request" => {
            let method = payload["method"].as_str().ok_or("Missing Codex method")?;
            let result = client.request(method, payload["params"].clone()).await?;
            Ok(
                json!({"connectionId":client.id.to_string(),"result":result["result"],"eventCursor":result["eventCursor"]}),
            )
        }
        "events" => Ok(
            json!({"connectionId":client.id.to_string(),"events":client.events.lock().drain(..).collect::<Vec<_>>(),"requests":client.requests.lock().values().cloned().collect::<Vec<_>>()}),
        ),
        "respond" => {
            let connection_id = client.id.to_string();
            if payload["connectionId"].as_str() != Some(connection_id.as_str()) {
                return Err("This Codex request belongs to an old connection".into());
            }
            let id = &payload["id"];
            let key = id.to_string();
            if !client.requests.lock().contains_key(&key) {
                return Err("This request was already resolved or is no longer pending".into());
            }
            let mut response = json!({"id":id});
            if let Some(error) = payload.get("error") {
                response["error"] = error.clone();
            } else {
                response["result"] = payload["result"].clone();
            }
            client.send(response).await?;
            client.requests.lock().remove(&key);
            Ok(Value::Null)
        }
        _ => Err("Unknown Codex operation".into()),
    }
}

#[uniffi::export]
impl HostRuntime {
    /// JSON-RPC is isolated at this boundary; provider-specific types live in the Codex adapter.
    pub async fn codex_call(
        &self,
        operation: String,
        payload: String,
    ) -> Result<String, HostRuntimeError> {
        let value = serde_json::from_str(&payload)
            .map_err(|e| HostRuntimeError::SshTransportFailure(e.to_string()))?;
        let inner = self.inner.clone();
        crate::runtime()
            .map_err(HostRuntimeError::SshTransportFailure)?
            .spawn(async move { call(inner, operation, value).await.map(|v| v.to_string()) })
            .await
            .map_err(|e| HostRuntimeError::SshTransportFailure(e.to_string()))?
            .map_err(HostRuntimeError::SshTransportFailure)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Opt-in real SSH test. Credentials are read from files and never printed.
    // Run against a provisioned test host with WHIP_CODEX_TEST_* variables.
    #[test]
    #[ignore = "requires an explicitly configured SSH host with a Codex daemon"]
    fn codex_daemon_live_ssh() {
        crate::runtime().unwrap().block_on(async {
            let host = std::env::var("WHIP_CODEX_TEST_HOST").unwrap();
            let port = std::env::var("WHIP_CODEX_TEST_PORT")
                .unwrap()
                .parse()
                .unwrap();
            let public_key = std::env::var("WHIP_CODEX_TEST_HOST_KEY").unwrap();
            crate::ssh::set_trusted_host_keys(vec![crate::ssh::TrustedHostKey {
                host: host.clone(),
                port,
                key_type: public_key.split_whitespace().next().unwrap().into(),
                public_key,
            }])
            .unwrap();
            let ssh = crate::ssh::SshSession::connect(
                &crate::ssh::SshConnectionConfig {
                    host,
                    port,
                    username: std::env::var("WHIP_CODEX_TEST_USER").unwrap(),
                    forward_agent: false,
                    credential: crate::ssh::SshCredential::Key {
                        private_key: std::fs::read_to_string(
                            std::env::var("WHIP_CODEX_TEST_KEY_FILE").unwrap(),
                        )
                        .unwrap(),
                        passphrase: None,
                    },
                },
                None,
            )
            .await
            .unwrap();
            let connection = HerdrConnection::new("codex-smoke".into(), "test".into(), None, None);
            connection.install(1, ssh.clone());
            let client = CodexDaemon::connect(connection.clone(), "codex-smoke".into())
                .await
                .unwrap();
            let result = client
                .request("thread/list", json!({"limit":1}))
                .await
                .unwrap();
            if let Some(thread) = result["result"]["data"]
                .as_array()
                .and_then(|data| data.first())
            {
                let read = client
                    .request(
                        "thread/read",
                        json!({"threadId":thread["id"],"includeTurns":true}),
                    )
                    .await
                    .unwrap();
                assert_eq!(read["result"]["thread"]["id"], thread["id"]);
                assert!(read["result"]["thread"]["turns"].is_array());
            }
            connection.clear(1);
            assert!(!client.current());
            assert!(client.request("thread/list", json!({})).await.is_err());
            drop(client);
            ssh.disconnect().await;
        });
    }
}
