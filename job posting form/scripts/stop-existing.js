const { execSync } = require("child_process");
require("dotenv").config();

const port = Number(process.env.PORT || 3000);

try {
  const netstatOutput = execSync("netstat -ano -p tcp", { encoding: "utf8" });
  const lines = netstatOutput.split(/\r?\n/);

  for (const line of lines) {
    if (!line.includes(`:${port}`) || !line.includes("LISTENING")) {
      continue;
    }

    const parts = line.trim().split(/\s+/);
    const pid = parts[parts.length - 1];

    if (!pid || !/^\d+$/.test(pid)) {
      continue;
    }

    const tasklistOutput = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, {
      encoding: "utf8"
    }).trim();

    if (!tasklistOutput.toLowerCase().startsWith('"node.exe"')) {
      continue;
    }

    execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
  }
} catch (_error) {
  // If cleanup fails, allow the normal start to continue and surface any bind error.
}
