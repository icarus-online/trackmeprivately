#!/usr/bin/env python3
"""Real Next.js HTTP regression with temporary SQLite and a standard cookie jar.

Run after npm run build. This is automated HTTP testing, not browser/passkey
acceptance. All requests go to a loopback test server; the public HTTPS URL is
used only for cookie policy and relative redirect resolution.
"""
import base64
import hashlib
import hmac
import http.cookiejar
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from email.message import Message

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = 'https://analytics.example.test'
SECRET = 'isolated-http-logout-test-secret-not-for-runtime'


def synthetic_token():
    def encode(value):
        return base64.urlsafe_b64encode(json.dumps(value).encode()).rstrip(b'=')
    message = encode({'alg': 'HS256'}) + b'.' + encode({
        'userId': 'synthetic-user', 'username': 'synthetic-admin',
        'iat': int(time.time()), 'exp': int(time.time()) + 3600,
    })
    signature = base64.urlsafe_b64encode(
        hmac.new(SECRET.encode(), message, hashlib.sha256).digest()).rstrip(b'=')
    return (message + b'.' + signature).decode()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class CookieResponse:
    def __init__(self, headers):
        self.headers = headers

    def info(self):
        return self.headers


def run_case(domain):
    with tempfile.TemporaryDirectory(prefix='trackmeprivately-logout-') as directory:
        temporary = Path(directory)
        # Do not load workspace .env files, databases, or setup tokens.
        for name in ['.next', 'node_modules', 'public']:
            (temporary / name).symlink_to(ROOT / name, target_is_directory=True)
        shutil.copy(ROOT / 'package.json', temporary / 'package.json')
        (temporary / 'prisma').mkdir()
        shutil.copy(ROOT / 'prisma/schema.prisma', temporary / 'prisma/schema.prisma')
        env = {
            'PATH': os.environ['PATH'], 'HOME': directory,
            'NODE_ENV': 'production', 'NEXT_TELEMETRY_DISABLED': '1',
            'DATABASE_URL': f'file:{temporary / "test.db"}',
            'NEXTAUTH_SECRET': SECRET, 'SESSION_COOKIE_SAME_SITE': 'strict',
            'ALLOWED_RP_ID': 'analytics.example.test',
            'ALLOWED_RP_ORIGIN': PUBLIC,
        }
        if domain:
            env['SESSION_COOKIE_DOMAIN'] = domain
        subprocess.run(['node', str(ROOT / 'node_modules/prisma/build/index.js'),
                        'db', 'push', '--skip-generate'], cwd=temporary, env=env,
                       check=True, stdout=subprocess.DEVNULL)
        with sqlite3.connect(temporary / 'test.db') as database:
            database.execute('INSERT INTO User (id, username, createdAt) VALUES (?, ?, ?)',
                             ('synthetic-user', 'synthetic-admin', int(time.time() * 1000)))
        server = subprocess.Popen([
            'node', str(ROOT / 'node_modules/next/dist/bin/next'),
            'start', '--hostname', '127.0.0.1', '--port', '0',
        ], cwd=temporary, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True)
        output = []
        reader = threading.Thread(target=lambda: output.extend(server.stdout), daemon=True)
        reader.start()
        # Explicitly disable any ambient outbound proxy configuration.
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        try:
            deadline = time.monotonic() + 30
            upstream = None
            while time.monotonic() < deadline:
                match = re.search(r'http://127\.0\.0\.1:(\d+)', ''.join(output))
                if match and any('Ready in' in line for line in output):
                    upstream = f'http://127.0.0.1:{match.group(1)}'
                    break
                if server.poll() is not None:
                    raise AssertionError('Isolated Next.js server exited before readiness')
                time.sleep(0.1)
            assert upstream, 'Isolated Next.js server did not become ready'

            def request(path, jar=None, method='GET', extra=None):
                public_request = urllib.request.Request(PUBLIC + path)
                if jar is not None:
                    jar.add_cookie_header(public_request)
                headers = {'Host': 'analytics.example.test',
                           'X-Forwarded-Proto': 'https',
                           **dict(public_request.header_items()), **(extra or {})}
                req = urllib.request.Request(upstream + path, headers=headers, method=method)
                try:
                    response = opener.open(req, timeout=15)
                except urllib.error.HTTPError as error:
                    response = error
                with response:
                    body = response.read().decode()
                    if jar is not None:
                        jar.extract_cookies(CookieResponse(response.headers), public_request)
                    return response.status, response.headers, body

            token = synthetic_token()
            for method in ['GET', 'POST']:
                jar = http.cookiejar.CookieJar()
                headers = Message()
                headers.add_header('Set-Cookie',
                    f'session_token={token}; Path=/; Secure; HttpOnly; SameSite=Strict'
                    + (f'; Domain={domain}' if domain else ''))
                jar.extract_cookies(CookieResponse(headers), urllib.request.Request(PUBLIC + '/login'))
                assert len(jar) == 1, 'Synthetic session must be stored before logout'
                status, _, dashboard = request('/', jar)
                assert status == 200 and 'Analytics Dashboard' in dashboard
                assert re.search(r'<a\b[^>]*href="/api/auth/logout"', dashboard), 'Dashboard GET link changed'
                status, headers, body = request('/api/auth/logout', jar, method)
                assert status == (307 if method == 'GET' else 200)
                if method == 'GET':
                    assert headers['Location'] == '/login'
                    assert urllib.parse.urljoin(PUBLIC + '/api/auth/logout', headers['Location']) == PUBLIC + '/login'
                    assert headers['Cache-Control'] == 'no-store'
                else:
                    assert json.loads(body) == {'success': True} and headers['Location'] is None
                deletion = headers.get_all('Set-Cookie') or []
                assert any('session_token=;' in value and 'Path=/' in value
                           and 'Max-Age=0' in value and 'HttpOnly' in value
                           and 'Secure' in value for value in deletion)
                if domain:
                    assert any(f'Domain={domain}' in value for value in deletion)
                else:
                    assert all('Domain=' not in value for value in deletion)
                assert not list(jar), 'Logout must remove the matching browser cookie scope'
                assert request('/login', jar)[0] == 200
                for path in ['/', '/?reload=1', '/dashboard']:
                    status, headers, body = request(path, jar)
                    assert status == 307 and urllib.parse.urlsplit(headers['Location']).path == '/login'
                    assert 'Analytics Dashboard' not in body, 'Protected content exposed after logout/reload'
                # A fresh synthetic session works; this is not a passkey sign-in test.
                status, _, _ = request('/', extra={'Cookie': f'session_token={synthetic_token()}'})
                assert status == 200

            for hostile in [
                {'Host': 'localhost:3000'},
                {'Host': 'evil.example', 'Forwarded': 'host=evil.example;proto=http',
                 'X-Forwarded-Host': 'evil.example', 'X-Forwarded-Proto': 'http',
                 'X-Forwarded-Port': '444', 'X-Forwarded-For': '192.0.2.1',
                 'X-Forwarded-Prefix': '//evil.example'},
                {'X-Forwarded-Host': 'evil.example, analytics.example.test'},
            ]:
                status, headers, _ = request('/api/auth/logout?next=https://evil.example', extra=hostile)
                assert status == 307 and headers['Location'] == '/login'
            print(f'PASS HTTP logout: {"Domain=" + domain if domain else "host-only"}; GET/POST, headers, cookie jar, dashboard and reload')
        finally:
            server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait(timeout=5)
            reader.join(timeout=2)
            server.stdout.close()


if __name__ == '__main__':
    assert (ROOT / '.next/BUILD_ID').is_file(), 'Run npm run build first'
    for cookie_domain in [None, '.example.test']:
        run_case(cookie_domain)
