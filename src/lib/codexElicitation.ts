export interface ElicitationField {
  type?: string;
  title?: string;
  description?: string;
  enum?: string[];
  enumNames?: string[];
  oneOf?: { const: string; title: string }[];
  items?: { enum?: string[]; anyOf?: { const: string; title: string }[] };
  default?: string | number | boolean | string[] | null;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
}
export interface ElicitationSchema {
  properties?: Record<string, ElicitationField>;
  required?: string[];
}
export function elicitationOptions(field: ElicitationField) {
  if (field.type === 'boolean')
    return [
      { value: 'true', label: 'Yes' },
      { value: 'false', label: 'No' },
    ];
  const titled = field.oneOf ?? field.items?.anyOf;
  if (titled) return titled.map(o => ({ value: o.const, label: o.title }));
  return (field.enum ?? field.items?.enum ?? []).map((value, i) => ({
    value,
    label: field.enumNames?.[i] ?? value,
  }));
}
export function elicitationContent(
  schema: ElicitationSchema,
  answers: Record<string, string>,
): Record<string, unknown> {
  const content: Record<string, unknown> = {};
  for (const [id, field] of Object.entries(schema.properties ?? {})) {
    const text = answers[id] ?? '';
    const label = field.title || id;
    if (!text) {
      if (schema.required?.includes(id))
        throw new Error(`Answer ${label} before continuing.`);
      continue;
    }
    const choices = elicitationOptions(field);
    if (field.type === 'boolean') {
      if (text !== 'true' && text !== 'false')
        throw new Error(`Choose Yes or No for ${label}.`);
      content[id] = text === 'true';
    } else if (field.type === 'number' || field.type === 'integer') {
      const value = Number(text);
      if (
        !Number.isFinite(value) ||
        (field.type === 'integer' && !Number.isInteger(value)) ||
        (field.minimum != null && value < field.minimum) ||
        (field.maximum != null && value > field.maximum)
      )
        throw new Error(`Enter a valid number for ${label}.`);
      content[id] = value;
    } else if (field.type === 'array') {
      const values: unknown = JSON.parse(text);
      if (
        !Array.isArray(values) ||
        values.some(value => !choices.some(o => o.value === value)) ||
        (field.minItems != null && values.length < field.minItems) ||
        (field.maxItems != null && values.length > field.maxItems)
      )
        throw new Error(`Check the choices for ${label}.`);
      content[id] = values;
    } else if (field.type === 'string') {
      if (
        (choices.length && !choices.some(o => o.value === text)) ||
        (field.minLength != null && text.length < field.minLength) ||
        (field.maxLength != null && text.length > field.maxLength)
      )
        throw new Error(`Check the answer for ${label}.`);
      content[id] = text;
    } else throw new Error(`Open Terminal to answer ${label}.`);
  }
  return content;
}
