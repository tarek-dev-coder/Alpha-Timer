# Alpha Timer

Alpha Timer is a Pomodoro-style timer with task management, built to boost focus and productivity.

[Visit Web Version](https://tarek-dev-coder.github.io/Alpha-Timer/)

---

## Features & Usage
- **Customize Durations**: Set the work and break lengths in Settings (a customized Pomodoro).
- **Add Task**: Enter a task and click "Add Task" or press "Enter".
- **Start Timer**: Click "Start" to begin. While it runs the button becomes "Pause"; click it again to resume.
- **Refresh a Session**: Click "Reset" to return to the start of a work session.
- **Complete Task**: Wait until the work session ends, skip the session, or click a task to mark it done. Tasks can also be toggled with `Enter` or `Space`.
- **Skip Session**: Click "Skip" to bypass the current session.
- **Task Management**: Add, complete, and remove tasks. Removing a task keeps keyboard focus nearby.
- **Toggle Theme**: Click "Toggle Theme" to switch. Until you pick a theme, the app follows your operating system preference.
- **Responsive Design**: Works on phones, tablets, and desktops.
- **App Icons**: Includes an SVG favicon, PNG icons, an Apple touch icon, and a web app manifest.

All task and settings data stays in your browser's `localStorage`.

---

## Project Structure
- `index.html` - app entry page
- `assets/css/styles.css` - layout, themes, and responsive styles
- `assets/js/theme-toggle.js` - early theme setup and toggle
- `assets/js/timer.js` - timer, task, and settings logic
- `assets/icons/` - favicon, Apple touch, and PWA icons
- `manifest.json` - web app manifest
- `robots.txt` - crawler rules
- `SECURITY.md` - security policy and private reporting

---

## Security
See [SECURITY.md](SECURITY.md) for the security model and private reporting instructions. The app is static, uses no third-party resources, and keeps data only in your browser.

---

## License
Licensed under **ALPHA.DEV License**.
