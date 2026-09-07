// After pkg produces AimTracker.exe, mark it as a GUI-subsystem app so Windows
// doesn't pop up a console (cmd) window when it's launched by double-click.
const fs = require("node:fs");
const path = require("node:path");

const exe = process.argv[2] || path.join(__dirname, "..", "dist", "AimTracker.exe");

const original = fs.readFileSync(exe);
const buffer = Buffer.from(original);

// DOS stub: e_lfanew (offset 0x3C) points to the PE signature.
const peOffset = buffer.readUInt32LE(0x3c);
const optionalHeader = peOffset + 4 + 20; // "PE\0\0" + COFF header
const magic = buffer.readUInt16LE(optionalHeader);

// Subsystem field lives in the optional header at 0x44 (same for PE32/PE32+).
// GUI=2, Console=3.
const subsystemOffset = optionalHeader + 0x44;
const subsystem = buffer.readUInt16LE(subsystemOffset);

const kind = magic === 0x20b ? "PE32+ (64-bit)" : magic === 0x10b ? "PE32 (32-bit)" : "unknown";
console.log(`Entry: ${exe}`);
console.log(`Magic: 0x${magic.toString(16).toUpperCase()} (${kind}), subsystem field @ ${subsystemOffset}`);
console.log(`Current subsystem: ${subsystem} (${subsystem === 2 ? "WINDOWS_GUI" : subsystem === 3 ? "CONSOLE" : "other"})`);

function sleep(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

if (subsystem !== 2) {
  buffer.writeUInt16LE(2, subsystemOffset);
  let attempt = 0;
  while (true) {
    try {
      fs.writeFileSync(exe, buffer);
      break;
    } catch (error) {
      attempt += 1;
      if (attempt >= 5 || !/EBUSY|EPERM|EACCES/.test(error.code)) throw error;
      console.log(`Write busy (${error.code}); retrying in ${attempt * 1000}ms…`);
      sleep(attempt * 1000);
    }
  }
  console.log("Patched subsystem to 2 (WINDOWS_GUI) — no console window will appear.");
} else {
  console.log("Already a GUI app — nothing to do.");
}
