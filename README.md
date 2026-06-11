# ATA (Altiora Trading API)

> **⚠️ This project has been abandoned.**  
> The development was discontinued due to the high costs associated with the MetaAPI service and infrastructure requirements.

<p align="center">
  <img src="./public/img/logo.png" alt="Altiora Logo" />
</p>

<p align="center">
  <a href="https://discord.gg/4mU5pEw8Gs"><img src="https://img.shields.io/badge/Join%20the%20community-5865F2?logo=discord&logoColor=white" alt="Discord"></a>
  <a href="https://x.com/AltioraPro"><img src="https://img.shields.io/twitter/follow/Altiora?style=social" alt="Follow Altiora"></a>
</p>

[Altiora](https://altiora.pro) backend API service for Autojournaling.

## Getting Started

1. Clone the repository

```bash
git clone https://github.com/AltioraPro/ATA
```

2. Enter the project directory

```bash
cd ATA
```

3. Prepare environment variables

```bash
copy .env.example .env
```

4. Install dependencies

```bash
bun install
```

5. Start the development server

```bash
bun dev
```

The API serves on `http://localhost:3001`.

## License

This project is licensed under the [MIT License](LICENSE).

## Security notice

This project was abandoned and is provided as-is for reference. It was **not designed for production deployment** without significant hardening:

- API endpoints have **no authentication** (`JWT_SECRET` is configured but unused).
- User identity relies on a spoofable `x-user-id` header.
- Destructive routes (`DELETE`, undeploy, sync) are publicly accessible if the server is exposed.

Do not deploy this service on the public internet without implementing proper auth, authorization, and network isolation. Never commit real credentials — use `.env` (see `.env.example`).
