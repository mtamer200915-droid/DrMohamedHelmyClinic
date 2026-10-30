# Dr. Mohamed Helmy Clinic

A bilingual Arabic/English clinic queue and patient-record web app.

## Patient records and backups

- Patient and visit data are saved automatically in the browser on the current device.
- Records remain available after refresh when you use the same browser and site address. They are not synced to another computer and are not stored in GitHub.
- Use **Download Backup** regularly to save a JSON copy. **Restore Backup** replaces the current browser data after confirmation.
- Backup files contain patient information. Keep them in a private, protected location and do not commit them to this repository.
- Browser storage is not encrypted. This is suitable for a prototype or local demo, not a secure production patient-record system. A real clinic deployment should use a protected database with user access controls and backups.

## Consultation rule

When **Consultation** is selected, the app automatically checks the patient by phone number. A consultation can be saved only when that patient has a completed examination on or before the consultation date. Complete the examination from the queue first.

The secretary can choose a date to view appointments, then edit or permanently delete a waiting visit. If a deleted visit was the patient's only visit, the patient file is deleted too.

## Run

Open `index.html` in a browser. If the app is hosted, use the same browser and hosted address each time so the browser can find the same saved records.
