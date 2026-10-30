# Dr. Mohamed Helmy Clinic

A bilingual Arabic/English clinic queue and patient-record web app.

## Patient records and backups

- Patient and visit data are saved automatically in the browser on the current device.
- Records remain available after refresh when you use the same browser and site address. They are not synced to another computer and are not stored in GitHub.
- Use **Download Backup** regularly to save a JSON copy. **Restore Backup** replaces the current browser data after confirmation.
- Backup files contain patient information. Keep them in a private, protected location and do not commit them to this repository.
- Browser storage is not encrypted. This is suitable for a prototype or local demo, not a secure production patient-record system. A real clinic deployment should use a protected database with user access controls and backups.

## Shared access from multiple devices

The optional Supabase setup adds sign-in and shared clinic data for authorized staff. Follow [CLOUD-SETUP.md](CLOUD-SETUP.md) before entering project settings. The browser uses only a public publishable key; never put a secret or service-role key in this repository. GitHub Pages hosts the app interface, while Supabase stores the clinic records.

## Consultation rule

When **Consultation** is selected, the app automatically checks the patient by phone number. A consultation requires a completed examination no more than one calendar month before the chosen date, and each patient can have at most two consultations per calendar month. Complete a new examination first if the previous one is too old.

The secretary can choose a date to view appointments, then edit or permanently delete a waiting visit. If a deleted visit was the patient's only visit, the patient file is deleted too.

## Run

Open `index.html` in a browser. If the app is hosted, use the same browser and hosted address each time so the browser can find the same saved records.
