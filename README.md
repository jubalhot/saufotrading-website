# SAUFO Trading Website

This repository contains the production-ready static website for SAUFO Trading and the SME Payroll web app.

## Cloudflare Pages Setup

Use these settings when connecting the repository to Cloudflare Pages:

- Framework preset: None
- Build command: leave blank
- Build output directory: `/`
- Production branch: `main`

Cloudflare should deploy directly from the repository root.

## Main URLs

- Website: `https://www.saufotrading.com`
- SME Payroll: `https://www.saufotrading.com/sme-payroll-cloud`
- Privacy Policy: `https://www.saufotrading.com/privacy.html`

## Notes

- The `_redirects` file must stay in the repository root.
- The `assets` folder must stay in the repository root.
- The SME Payroll app is available at both `sme-payroll-cloud.html` and `sme-payroll-cloud/index.html`.
