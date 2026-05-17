import * as fs from 'fs';
import * as path from 'path';

// Resolve and load .env.local synchronously before other modules compile
const envPath = path.resolve(__dirname, '../../.env.local');
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf8');
  envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#\s][^=]+)=(.*)$/);
    if (match) {
      process.env[match[1]] = match[2];
    }
  });
}
