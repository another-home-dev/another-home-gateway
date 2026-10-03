# Another Home — API Gateway

The single entry point for every API call in the Another Home hostel management system. It checks the caller's Asgardeo access token, attaches their identity to the request, and forwards it to the right backend service.

Part of [Another Home](https://github.com/another-home-dev). Live at <https://34.54.94.62.nip.io/api/v1>.

## What it does

- **Authentication.** Verifies the `Authorization: Bearer <token>` header against Asgardeo's public keys (JWKS). Requests without a valid token get `401`.
- **Identity headers.** Removes any `x-user-*` headers the client sent, then sets them from the verified token: `x-user-id` (Asgardeo `sub`), `x-user-roles`, `x-user-email` and `x-user-name`. Backend services trust only these.
- **Routing.** Forwards `/api/v1/<service>/...` to that service, finding a healthy instance through Consul. If Consul has none, it falls back to the service URL from the environment.
- **Warden management.** Creates warden accounts in Asgardeo and assigns them the `warden` role (super-admin only).
- **API docs.** Combines every service's Swagger document into one page.

## Routes

| Path | Goes to |
| --- | --- |
| `/api/v1/accommodation/*` | Accommodation service |
| `/api/v1/operations/*` | Operations service |
| `/api/v1/finance/*` | Finance service |
| `/api/v1/notifications/*` | Notification service |
| `GET /api/v1/admin/wardens` | Lists warden accounts (handled here) |
| `POST /api/v1/admin/wardens` | Creates a warden with a temporary password (handled here) |
| `GET /api/docs` | Combined Swagger UI for all services |

## Configuration

| Variable | Purpose | Default |
| --- | --- | --- |
| `PORT` | Port to listen on | `3001` |
| `ASGARDEO_TENANT` | Asgardeo organisation name | |
| `ASGARDEO_JWKS_URI` | Asgardeo public-key endpoint used to verify tokens | |
| `ASGARDEO_ADMIN_CLIENT_ID`, `ASGARDEO_ADMIN_CLIENT_SECRET` | Machine-to-machine app used to create wardens | |
| `ASGARDEO_WARDEN_ROLE_ID` | ID of the `warden` role in Asgardeo | |
| `CONSUL_HOST`, `CONSUL_PORT` | Service registry | |
| `ACCOMMODATION_SERVICE_URL` | Fallback when Consul has no instance | `http://accommodation:4001` |
| `OPERATIONS_SERVICE_URL` | Fallback | `http://operations:4002` |
| `FINANCE_SERVICE_URL` | Fallback | `http://finance:4003` |
| `NOTIFICATION_SERVICE_URL` | Fallback | `http://notification:4004` |
| `GATEWAY_PUBLIC_URL` | Public URL shown in the combined API docs | |

## Run locally

The easiest way is to start the whole system with `docker compose up --build` from [another-home-infra](https://github.com/another-home-dev/anotherhome-infrastructure). Its README shows how to clone every repository into the folder names it expects.

To run the gateway on its own:

```bash
npm install
npm run start:dev
```

## Tests

```bash
npm test          # unit tests
npm run test:e2e  # end-to-end tests
```

## Project structure

```
src/
├── main.ts                 bootstrap, CORS, combined Swagger docs
├── auth.middleware.ts      token verification and identity headers
├── proxy.middleware.ts     routing to the backend services
├── discovery/              Consul lookups
├── admin/                  warden management (Asgardeo SCIM API)
└── docs/                   merges each service's Swagger document
```

## Deployment

`cloudbuild.yaml` runs on every push to `main`: tests, Docker build, push to Artifact Registry, then a rolling update of the `gateway` deployment on GKE.
