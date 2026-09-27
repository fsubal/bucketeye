import { jwksResolver } from "../keys";
import type { KeyResolver } from "../provider";
import { JwtProvider } from "./jwtBase";

/**
 * Google Cloud Identity-Aware Proxy。X-Goog-IAP-JWT-Assertion に ES256 の JWT が付く。
 * aud は "/projects/<番号>/global/backendServices/<ID>"（GCE/GKE）または "/projects/<番号>/apps/<プロジェクトID>"（App Engine）
 */
export class GcpIapProvider extends JwtProvider {
  static readonly JWKS_URL =
    "https://www.gstatic.com/iap/verify/public_key-jwk";
  readonly name = "gcp_iap";
  protected readonly headerName = "X-Goog-IAP-JWT-Assertion";
  protected readonly algorithms = ["ES256"];
  protected override readonly issuer = "https://cloud.google.com/iap";
  protected override readonly audience: string;

  constructor(opts: {
    audience: string | undefined;
    adminEmails: readonly string[];
    keyResolver?: KeyResolver;
  }) {
    if (!opts.audience)
      throw new Error("IAP_AUDIENCE is required for AUTH_PROVIDER=gcp_iap");
    super(
      opts.adminEmails,
      opts.keyResolver ?? jwksResolver(GcpIapProvider.JWKS_URL),
    );
    this.audience = opts.audience;
  }
}
