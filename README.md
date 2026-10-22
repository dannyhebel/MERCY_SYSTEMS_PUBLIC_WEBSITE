# MERCY Systems public website

Source for https://mercysystems.com, deployed on DigitalOcean App Platform (app `mercy-systems-website`).

- `public/`: static website (homepage and `/amcdt/` product pages, legal documents)
- `store/`: AMCDT store service (Node.js 22): free trials, Stripe checkout, license delivery, billing portal
- `.do/app.yaml`: App Platform spec (no secret values; secrets are set in DigitalOcean)
- `tools/`: page build and link-check helpers

Deployment instructions: [DEPLOY-APP-PLATFORM.md](DEPLOY-APP-PLATFORM.md)

© 2026 MERCY Systems. Precision Technology.
