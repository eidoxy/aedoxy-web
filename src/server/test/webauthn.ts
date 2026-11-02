import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";

/**
 * A minimal software authenticator (ES256, "none" attestation) so the server side of WebAuthn can be tested
 * without a browser. It produces the same JSON a browser hands to @simplewebauthn/server.
 */

const b64u = (b: Buffer) => b.toString("base64url");
const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest();

/** CBOR for the few shapes used here: a byte string with a 1 or 2 byte length header. */
function cborBytes(b: Buffer) {
  const head = b.length < 24 ? [0x40 + b.length] : b.length < 256 ? [0x58, b.length] : [0x59, b.length >> 8, b.length & 0xff];
  return Buffer.concat([Buffer.from(head), b]);
}
const cborText = (s: string) => Buffer.concat([Buffer.from([0x60 + s.length]), Buffer.from(s)]);

export function createAuthenticator(opts: { rpID: string; origin: string }) {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  const x = Buffer.from(jwk.x!, "base64url");
  const y = Buffer.from(jwk.y!, "base64url");
  // COSE_Key: {1: 2 (EC2), 3: -7 (ES256), -1: 1 (P-256), -2: x, -3: y}
  const coseKey = Buffer.concat([Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20]), x, Buffer.from([0x22, 0x58, 0x20]), y]);
  const credentialId = randomBytes(32);
  const rpIdHash = sha256(opts.rpID);
  let counter = 0;

  const clientData = (type: "webauthn.create" | "webauthn.get", challenge: string) =>
    Buffer.from(JSON.stringify({ type, challenge, origin: opts.origin, crossOrigin: false }));
  const counterBytes = (n: number) => {
    const b = Buffer.alloc(4);
    b.writeUInt32BE(n);
    return b;
  };

  return {
    credentialId: b64u(credentialId),
    /** Public key in the form the passkey table stores (standard base64 of the COSE key). */
    publicKeyBase64: coseKey.toString("base64"),

    register(challenge: string, { userVerified = true }: { userVerified?: boolean } = {}) {
      const flags = 0x01 | 0x40 | (userVerified ? 0x04 : 0); // UP | AT | UV
      const credLen = Buffer.alloc(2);
      credLen.writeUInt16BE(credentialId.length);
      const authData = Buffer.concat([rpIdHash, Buffer.from([flags]), counterBytes(0), Buffer.alloc(16), credLen, credentialId, coseKey]);
      const attestationObject = Buffer.concat([
        Buffer.from([0xa3]),
        cborText("fmt"),
        cborText("none"),
        cborText("attStmt"),
        Buffer.from([0xa0]),
        cborText("authData"),
        cborBytes(authData),
      ]);
      return {
        id: b64u(credentialId),
        rawId: b64u(credentialId),
        type: "public-key",
        clientExtensionResults: {},
        response: { clientDataJSON: b64u(clientData("webauthn.create", challenge)), attestationObject: b64u(attestationObject), transports: ["internal"] },
      };
    },

    assert(challenge: string, { userVerified = true }: { userVerified?: boolean } = {}) {
      counter += 1;
      const authData = Buffer.concat([rpIdHash, Buffer.from([userVerified ? 0x05 : 0x01]), counterBytes(counter)]);
      const cd = clientData("webauthn.get", challenge);
      const signature = sign("sha256", Buffer.concat([authData, sha256(cd)]), privateKey);
      return {
        id: b64u(credentialId),
        rawId: b64u(credentialId),
        type: "public-key",
        clientExtensionResults: {},
        response: { clientDataJSON: b64u(cd), authenticatorData: b64u(authData), signature: b64u(signature) },
      };
    },
  };
}

/** Folds Set-Cookie lines into one `cookie` request header value (later lines win per name). */
export function cookieHeader(...setCookieLines: string[][]): string {
  const jar = new Map<string, string>();
  for (const lines of setCookieLines) {
    for (const line of lines) {
      const [pair] = line.split(";");
      const i = pair.indexOf("=");
      jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
  }
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}
