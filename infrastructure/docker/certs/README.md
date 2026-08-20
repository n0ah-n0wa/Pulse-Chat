# Local TLS inspection certificates

Some networks and endpoint security products (corporate proxies, antivirus
HTTPS scanning) terminate TLS with their own certificate authority. Node.js
inside a container trusts neither, so `pnpm install` fails during an image
build with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`.

If that happens, export the intercepting root certificate and drop it here as a
PEM file with a `.crt` extension. Every image build trusts whatever it finds in
this directory. These roots are generated per machine, so `*.crt` and `*.pem`
are git-ignored and never shared.

On Windows, where the root is in the certificate store:

```powershell
$cert = Get-ChildItem Cert:\LocalMachine\Root |
  Where-Object { $_.Subject -match 'YOUR CA NAME' }

@(
  '-----BEGIN CERTIFICATE-----'
  [Convert]::ToBase64String($cert.RawData, 'InsertLineBreaks')
  '-----END CERTIFICATE-----'
) -join "`n" | Set-Content infrastructure/docker/certs/local-tls-inspection.crt -Encoding ascii
```

To find the name, ask a container which authority it is being handed:

```bash
docker run --rm node:22.15.0-bookworm-slim node -e "const t=require('node:tls');const s=t.connect({host:'registry.npmjs.org',port:443,servername:'registry.npmjs.org',rejectUnauthorized:false},()=>{console.log(s.getPeerCertificate(true).issuer);s.end()})"
```

On a network that does not intercept TLS, leave this directory as it is.
