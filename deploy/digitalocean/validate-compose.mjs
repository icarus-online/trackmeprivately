import { spawnSync } from 'node:child_process';

const compose = spawnSync(
  'docker',
  [
    'compose',
    '-f',
    'docker-compose.yml',
    '-f',
    'deploy/digitalocean/docker-compose.production.yml',
    'config',
    '--format',
    'json',
  ],
  {
    cwd: new URL('../..', import.meta.url),
    encoding: 'utf8',
    env: {
      ...process.env,
      ALLOWED_RP_ID: 'analytics.example.test',
      ALLOWED_RP_ORIGIN: 'https://analytics.example.test',
      NEXTAUTH_SECRET: 'compose-validation-only-not-a-runtime-secret',
    },
  },
);

if (compose.error) {
  throw compose.error;
}

if (compose.status !== 0) {
  process.stderr.write(compose.stderr);
  process.exit(compose.status ?? 1);
}

const config = JSON.parse(compose.stdout);
const app = config.services?.app;

if (!app) {
  throw new Error('The production Compose configuration must define the app service.');
}

const ports = app.ports ?? [];
if (
  ports.length !== 1
  || ports[0].host_ip !== '127.0.0.1'
  || ports[0].target !== 3000
) {
  throw new Error('The app must publish only port 3000 on loopback.');
}

const volumes = app.volumes ?? [];
if (
  volumes.length !== 1
  || volumes[0].type !== 'bind'
  || volumes[0].source !== '/var/lib/trackmeprivately/data'
  || volumes[0].target !== '/data'
) {
  throw new Error('The app must bind the expected persistent host directory to /data.');
}

console.log('Production Compose isolation and persistence checks passed.');
