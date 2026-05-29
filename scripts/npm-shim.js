#!/usr/bin/env node
'use strict';
//
// npm thin-installer launcher for CodeGraph.
//
// The heavy artifact is a per-platform standalone binary (Bun-compiled) shipped
// as an optionalDependency: @colbymchenry/codegraph-<platform>-<arch>. npm installs
// only the one matching the host, via each package's `os`/`cpu` fields (the esbuild
// pattern). This shim — run by the user's OWN Node — locates that binary and execs
// it. The user's Node is only ever a launcher; even an ancient version can run this
// file.
//
// Self-heal (issue #303): some registries — notably the npmmirror/cnpm mirrors,
// and some corporate proxies — don't reliably mirror the per-platform
// optionalDependencies. npm treats an unfetchable optional dep as success and
// silently skips it, so the binary goes missing and every command fails. When
// the installed binary can't be resolved, this shim falls back to downloading
// it straight from GitHub Releases into a cache dir, then runs that. Knobs:
//   CODEGRAPH_NO_DOWNLOAD=1     disable the network fallback (print guidance)
//   CODEGRAPH_INSTALL_DIR=DIR   cache location (default: ~/.codegraph)
//   CODEGRAPH_DOWNLOAD_BASE=URL release-download base (for mirrors/air-gapped)

var childProcess = require('child_process');
var fs = require('fs');
var os = require('os');
var path = require('path');

var target = process.platform + '-' + process.arch;
var isWindows = process.platform === 'win32';
var REPO = 'colbymchenry/codegraph';

main().catch(function (e) {
  process.stderr.write('codegraph: ' + (e && e.message ? e.message : String(e)) + '\n');
  process.exit(1);
});

async function main() {
  var resolved = resolveInstalledBinary() || (await selfHealBinary());
  var res = childProcess.spawnSync(resolved.command, resolved.args, { stdio: 'inherit' });
  if (res.error) {
    process.stderr.write('codegraph: ' + res.error.message + '\n');
    process.exit(1);
  }
  process.exit(res.status === null ? 1 : res.status);
}

function resolveInstalledBinary() {
  try {
    var pkg = '@colbymchenry/codegraph-' + target;
    var binary = require.resolve(pkg + '/bin/codegraph' + (isWindows ? '.exe' : ''));
    return { command: binary, args: process.argv.slice(2) };
  } catch (e) {
    return null;
  }
}

function binaryIn(dir) {
  var binary = path.join(dir, 'bin', 'codegraph' + (isWindows ? '.exe' : ''));
  if (fs.existsSync(binary)) return { command: binary, args: process.argv.slice(2) };
  return null;
}

async function selfHealBinary() {
  var version = readVersion();
  var bundlesDir = path.join(process.env.CODEGRAPH_INSTALL_DIR || path.join(os.homedir(), '.codegraph'), 'bundles');
  var dest = path.join(bundlesDir, target + '-' + version);

  var cached = binaryIn(dest);
  if (cached) return cached;

  if (process.env.CODEGRAPH_NO_DOWNLOAD) {
    fail('the network fallback is disabled (CODEGRAPH_NO_DOWNLOAD is set).');
  }

  var asset = 'codegraph-' + target + (isWindows ? '.exe' : '');
  var base = process.env.CODEGRAPH_DOWNLOAD_BASE || ('https://github.com/' + REPO + '/releases/download');
  var url = base + '/v' + version + '/' + asset;

  process.stderr.write(
    'codegraph: platform binary missing (registry did not provide @colbymchenry/codegraph-' + target + ').\n' +
    'codegraph: downloading ' + asset + ' from GitHub Releases (' + version + ')...\n'
  );

  fs.mkdirSync(bundlesDir, { recursive: true });
  var stage = fs.mkdtempSync(path.join(bundlesDir, '.dl-'));
  try {
    var binaryPath = path.join(stage, asset);
    await download(url, binaryPath, 6);

    var raced = binaryIn(dest);
    if (raced) { rmrf(stage); return raced; }

    var extracted = path.join(stage, 'bundle');
    fs.mkdirSync(extracted + '/bin', { recursive: true });
    fs.copyFileSync(binaryPath, extracted + '/bin/' + asset);
    fs.chmodSync(extracted + '/bin/' + asset, 0o755);

    try {
      fs.renameSync(extracted, dest);
    } catch (e) {
      var other = binaryIn(dest);
      if (other) { rmrf(stage); return other; }
      throw e;
    }
  } catch (e) {
    rmrf(stage);
    fail('download failed (' + e.message + ').\n  URL: ' + url);
  }
  rmrf(stage);

  var ready = binaryIn(dest);
  if (!ready) fail('downloaded binary is missing under ' + dest + '.');
  process.stderr.write('codegraph: binary ready.\n');
  return ready;
}

function readVersion() {
  try {
    return require(path.join(__dirname, 'package.json')).version;
  } catch (e) {
    fail('could not read this package\'s version to locate a matching release.');
  }
}

function download(url, dest, redirectsLeft) {
  return new Promise(function (resolve, reject) {
    var https = require('https');
    var req = https.get(url, { headers: { 'User-Agent': 'codegraph-npm-shim' }, timeout: 30000 }, function (res) {
      var status = res.statusCode;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) { reject(new Error('too many redirects')); return; }
        download(new URL(res.headers.location, url).toString(), dest, redirectsLeft - 1).then(resolve, reject);
        return;
      }
      if (status !== 200) { res.resume(); reject(new Error('HTTP ' + status)); return; }
      var file = fs.createWriteStream(dest);
      res.on('error', reject);
      res.pipe(file);
      file.on('error', reject);
      file.on('finish', function () { file.close(function () { resolve(); }); });
    });
    req.on('timeout', function () { req.destroy(new Error('connection timed out')); });
    req.on('error', reject);
  });
}

function rmrf(p) {
  try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) { /* best effort */ }
}

function fail(reason) {
  process.stderr.write(
    'codegraph: no prebuilt binary for ' + target + '.\n' +
    (reason ? 'codegraph: ' + reason + '\n' : '') +
    'Expected the optional package @colbymchenry/codegraph-' + target + ' to be installed.\n' +
    'A registry mirror (e.g. npmmirror/cnpm) that did not mirror the per-platform\n' +
    'package is the usual cause. Fixes:\n' +
    '  - install from the official registry:\n' +
    '      npm i -g @colbymchenry/codegraph --registry=https://registry.npmjs.org\n' +
    '  - or use the standalone installer (no Node required):\n' +
    '      curl -fsSL https://raw.githubusercontent.com/' + REPO + '/main/install.sh | sh\n'
  );
  process.exit(1);
}
