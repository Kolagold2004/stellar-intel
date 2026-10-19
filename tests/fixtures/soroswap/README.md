# Soroswap API fixtures

Real responses recorded from `https://api.soroswap.finance` for issue #1084.
`tests/hop-swap-soroswap.fixtures.spec.ts` replays them through a stubbed
`fetch`, so the swap tests run with the network unplugged. Load them with
`loadSoroswapFixture(name)` from `load.ts`.

Every fixture carries a `capturedAt` timestamp, the response `status` and
`body`, and the `request` body where it was recorded. `load.ts` accepts both
layouts in use: flat (`{ status, body }`) and nested (`{ response: { status, body } }`).

Never hand-edit a fixture. If the live API changes shape, record it again.

## Fixtures

| File                             | Captured   | Status | What it is                                                                 |
| -------------------------------- | ---------- | ------ | -------------------------------------------------------------------------- |
| `mainnet-quote-usdc-eurc.json`   | 2026-10-06 | 201    | POST `/quote`, USDC to EURC, one direct Soroswap pool.                     |
| `mainnet-quote-usdc-aqua.json`   | 2026-10-06 | 201    | POST `/quote`, USDC to AQUA, split 35/65 across two multi-hop Aqua routes. |
| `mainnet-quote-usdc-usdglo.json` | 2026-10-06 | 201    | POST `/quote`, USDC to USDGLO, one direct Aqua pool.                       |
| `mainnet-build.json`             | 2026-10-06 | 400    | POST `/quote/build` for an unfunded account: Account not found.            |
| `quote-error-bad-amount.json`    | 2026-10-06 | 400    | POST `/quote` with `amount: "0"`.                                          |
| `400-no-path-found.json`         | 2026-09-27 | 400    | POST `/quote` for a pair with no route.                                    |
| `400-invalid-address.json`       | 2026-09-27 | 400    | POST `/quote` with a non-contract `assetIn`.                               |
| `400-bad-protocol.json`          | 2026-09-27 | 400    | POST `/quote` with an unrecognised protocol name.                          |
| `403-forbidden.json`             | 2026-09-27 | 403    | POST `/quote` with no Authorization header.                                |

Two error body shapes reach `SoroswapApiError`:

- **`{ message, error, statusCode }`**: the standard NestJS Bad Request shape
  (403, validation errors, build errors).
- **`{ title, detail, extra, error }`**: NestJS Problem Details, returned when
  no route is found.

## Not covered

A successful `/quote/build` response. It needs a funded mainnet account with a
trustline for the input asset, so `mainnet-build.json` records the error the
API returns for an unfunded one instead.
