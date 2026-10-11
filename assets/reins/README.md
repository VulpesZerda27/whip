# Reins artwork

The three original PNG files were supplied by the fork maintainer on 11 October
2026 for the Reins app. They are included under this fork's AGPL-3.0-or-later
license. The standard, dark and tinted originals are kept unchanged.

Run `npm run generate:android-icon` to regenerate platform assets and the install
QR from these originals. Android adaptive layers add transparent padding for the
108dp/72dp layer geometry; themed and notification icons use the tinted image's
luminance as their alpha mask. Dark Android resources and the in-app mark use the
dark original. iOS Icon Composer uses the standard original; iOS builds require
macOS and have not been validated on this Linux workstation.

The old Whip artwork remains in the repository as upstream history; active Reins
app icons use the files in this directory.
