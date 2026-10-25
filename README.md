# Threadline — Tailor Shop Manager

A responsive web app for a men's tailor shop, built with React and Vite.

## Included in this build

- Customer directory with search and customer IDs
- Garment-specific measurement profiles for shirt, trouser, coat/blazer, sherwani, kurta and pajama
- Measurement values stored with their unit; switching between inches and centimetres converts the displayed values
- Orders with due date, garment description, total price, advance payment, balance and production status
- Dashboard summary and order status filtering
- Browser persistence between visits on the same browser/device
- CSV export for customers and orders
- Full JSON backup export and JSON backup restore (replacement is confirmed before importing)
- Printable measurement card; use the browser print dialog to print or save as PDF
- Starts with an empty workspace rather than fake customer records
- Responsive layout for desktop and mobile

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Build and preview:

```bash
npm run build
npm run preview
```

## Host as a static website

For Netlify, Vercel or Cloudflare Pages, connect the repository or upload the project folder, then configure:

- Build command: `npm run build`
- Output directory: `dist`
- Node version: 20 or newer

The current project does not require environment variables for local mode.

## Important production limitation — read before using real customer data

**This version is a single-browser build, not a complete multi-device production system.** Customer and order data are stored in the browser's local storage. Hosting the site does not sync data between a phone, laptop or another browser, and clearing browser data can erase records. CSV/JSON exports and print-to-PDF are included, but they are not a substitute for a cloud database and automated backups.

Before using it as a shared shop system or entering sensitive customer records, add a cloud backend (for example, Supabase) with user authentication, per-shop access policies, cloud sync, database backups and a privacy notice. Test those controls before going live. Do not put a database service-role key in frontend code.

## Exports and restore

Open **Settings**:

- **Export CSV** downloads customer or order data for spreadsheet software.
- **Download backup** exports all customer profiles, measurement records and orders as JSON.
- **Import backup** validates the basic backup structure and asks for confirmation before replacing current data.
- **Print / PDF** opens a print-friendly card for the selected customer from the Measurements page. In the print dialog choose **Save as PDF**.

Keep backups in a secure location. Customer names, phone numbers and measurements are private shop records. Only import a backup from a trusted source.

## Measurement and tailoring note

Measurement labels are a starter checklist and can vary by tailor and garment style. Confirm the exact measuring points with the tailor before cutting fabric. The app records entered values; it does not calculate ease, pattern dimensions or cutting allowances.
