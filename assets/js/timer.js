'use strict';

/*
 * Alpha Timer
 *
 * Fixes applied:
 *  - Task text is stored separately from the "Remove" button so it no longer
 *    gets polluted with the button label in localStorage.
 *  - Task completion is persisted when it is changed automatically.
 *  - Corrupt/foreign localStorage data can no longer crash the page, and all
 *    keys are namespaced with a one-time migration from the old keys.
 *  - Durations are validated against the allowed range before use.
 *  - The countdown is deadline based, so it no longer drifts (throttled tabs,
 *    blocking alerts, slow frames, ...).
 *  - The configured work duration is reflected immediately on load.
 *  - Reset/Pause/Resume work, and the session status actually updates.
 *  - Task rows are keyboard accessible, removing a task keeps focus nearby,
 *    and Enter during IME composition does not add a half-typed task.
 */
(function initAlphaTimer() {
        // GitHub Pages cannot send a frame-ancestors response header. Do not
        // initialize the app inside a frame (clickjacking fallback). The theme
        // script hides the document; this also prevents hidden timer activity.
        try {
                if (window.top !== window.self) {
                        document.documentElement.hidden = true;
                        return;
                }
        } catch (error) {
                document.documentElement.hidden = true;
                return;
        }

        const DEFAULT_WORK_MINUTES = 25;
        const DEFAULT_BREAK_MINUTES = 5;
        const MIN_MINUTES = 1;
        const MAX_MINUTES = 1440;
        const MAX_TASK_LENGTH = 500;
        const MAX_TASKS = 500;
        // A valid list of 500 maximum-length tasks is well under this limit.
        // Reject oversized foreign values before JSON.parse to bound work.
        const MAX_STORED_TASKS_LENGTH = 1000000;
        const TICK_INTERVAL_MS = 250;

        const STORAGE_PREFIX = 'alphaTimer.';
        const STORAGE_KEYS = {
                tasks: STORAGE_PREFIX + 'tasks',
                workDuration: STORAGE_PREFIX + 'workDuration',
                breakDuration: STORAGE_PREFIX + 'breakDuration'
        };
        const LEGACY_STORAGE_KEYS = {
                tasks: 'tasks',
                workDuration: 'workDuration',
                breakDuration: 'breakDuration'
        };

        const timerDisplay = document.getElementById('timer');
        const sessionStatus = document.getElementById('session-status');
        const startButton = document.getElementById('start');
        const skipButton = document.getElementById('skip');
        const resetButton = document.getElementById('reset');
        const taskInput = document.getElementById('task-input');
        const addTaskButton = document.getElementById('add-task');
        const tasksContainer = document.getElementById('tasks');
        const workDurationInput = document.getElementById('work-duration');
        const breakDurationInput = document.getElementById('break-duration');

        // Required elements are missing (page structure changed): do nothing
        // instead of throwing on every event.
        if (!timerDisplay || !startButton || !addTaskButton || !taskInput ||
                !tasksContainer || !workDurationInput || !breakDurationInput) {
                return;
        }

        /* ------------------------------------------------------------------ *
         * State
         * ------------------------------------------------------------------ */

        let intervalId = null;
        let state = 'idle'; // 'idle' | 'running' | 'paused'
        let isWorkSession = true;
        let workDuration = DEFAULT_WORK_MINUTES * 60;
        let breakDuration = DEFAULT_BREAK_MINUTES * 60;
        let currentTime = workDuration;
        let deadline = 0;

        /* ------------------------------------------------------------------ *
         * Storage helpers (localStorage can throw in private/blocked contexts)
         * ------------------------------------------------------------------ */

        function readStorage(key) {
                try {
                        return window.localStorage.getItem(key);
                } catch (error) {
                        return null;
                }
        }

        function readLegacyStorage(key) {
                try {
                        return window.localStorage.getItem(key);
                } catch (error) {
                        return null;
                }
        }

        function writeStorage(key, value) {
                try {
                        window.localStorage.setItem(key, value);
                } catch (error) {
                        // Quota exceeded or storage disabled: the app keeps working.
                }
        }

        function isValidMinutesValue(value) {
                if (value === null || value === undefined || value === '') {
                        return false;
                }
                const parsed = Number(value);
                return Number.isInteger(parsed) && parsed >= MIN_MINUTES && parsed <= MAX_MINUTES;
        }

        function migrateLegacyMinutes(storageKey, legacyKey) {
                if (readStorage(storageKey) !== null) {
                        return;
                }
                const legacyValue = readLegacyStorage(legacyKey);
                if (isValidMinutesValue(legacyValue)) {
                        writeStorage(storageKey, String(Number(legacyValue)));
                }
        }

        function migrateStorage() {
                if (readStorage(STORAGE_KEYS.tasks) === null) {
                        const legacyTasks = readLegacyStorage(LEGACY_STORAGE_KEYS.tasks);
                        if (legacyTasks !== null && legacyTasks.length <= MAX_STORED_TASKS_LENGTH) {
                                try {
                                        const parsed = JSON.parse(legacyTasks);
                                        const isValid = Array.isArray(parsed) && parsed.every(function (entry) {
                                                return entry !== null &&
                                                        typeof entry === 'object' &&
                                                        typeof entry.text === 'string' &&
                                                        typeof entry.completed === 'boolean';
                                        });
                                        if (isValid) {
                                                writeStorage(STORAGE_KEYS.tasks, legacyTasks);
                                        }
                                } catch (error) {
                                        // Ignore malformed legacy data.
                                }
                        }
                }
                migrateLegacyMinutes(STORAGE_KEYS.workDuration, LEGACY_STORAGE_KEYS.workDuration);
                migrateLegacyMinutes(STORAGE_KEYS.breakDuration, LEGACY_STORAGE_KEYS.breakDuration);
        }

        /* ------------------------------------------------------------------ *
         * Rendering helpers
         * ------------------------------------------------------------------ */

        function formatTime(totalSeconds) {
                const numericSeconds = Number(totalSeconds);
                const safeSeconds = Number.isFinite(numericSeconds)
                        ? Math.max(0, Math.floor(numericSeconds))
                        : 0;
                const minutes = Math.floor(safeSeconds / 60);
                const seconds = safeSeconds % 60;
                return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
        }

        function updateTimerDisplay() {
                timerDisplay.textContent = formatTime(currentTime);
        }

        function updateSessionStatus() {
                if (sessionStatus) {
                        sessionStatus.textContent = isWorkSession ? 'Work session' : 'Break session';
                }
        }

        function updateControls() {
                if (state === 'running') {
                        startButton.textContent = 'Pause';
                        startButton.setAttribute('aria-label', 'Pause timer');
                } else if (state === 'paused') {
                        startButton.textContent = 'Resume';
                        startButton.setAttribute('aria-label', 'Resume timer');
                } else {
                        startButton.textContent = 'Start';
                        startButton.setAttribute('aria-label', 'Start timer');
                }
        }

        function updateTaskStatus() {
                getTaskElements().forEach(function (taskElement) {
                        taskElement.classList.toggle('break', !isWorkSession);
                });
        }

        /* ------------------------------------------------------------------ *
         * Countdown (deadline based, so it never accumulates drift)
         * ------------------------------------------------------------------ */

        function setRemaining(seconds) {
                const numericSeconds = Number(seconds);
                const safeSeconds = Number.isFinite(numericSeconds)
                        ? Math.min(Math.max(0, Math.round(numericSeconds)), MAX_MINUTES * 60)
                        : 0;
                currentTime = safeSeconds;
                deadline = Date.now() + currentTime * 1000;
                updateTimerDisplay();
        }

        function clearTicking() {
                if (intervalId !== null) {
                        window.clearInterval(intervalId);
                        intervalId = null;
                }
        }

        function stopTicking() {
                clearTicking();
                state = 'idle';
                updateControls();
        }

        function startTicking() {
                clearTicking();
                state = 'running';
                deadline = Date.now() + currentTime * 1000;
                intervalId = window.setInterval(tick, TICK_INTERVAL_MS);
                updateControls();
        }

        function tick() {
                if (state !== 'running') {
                        return;
                }
                const remaining = Math.ceil((deadline - Date.now()) / 1000);
                const safeRemaining = Number.isFinite(remaining) ? Math.max(0, remaining) : 0;
                if (safeRemaining !== currentTime) {
                        currentTime = safeRemaining;
                        updateTimerDisplay();
                }
                if (safeRemaining <= 0) {
                        finishSession();
                }
        }

        function finishSession() {
                clearTicking();
                state = 'idle';

                if (isWorkSession) {
                        completeFirstUncheckedTask();
                        isWorkSession = false;
                        setRemaining(breakDuration);
                        updateSessionStatus();
                        updateTaskStatus();
                        updateControls();
                        window.alert('Work session ended! Break time starts now.');
                        startTicking();
                        return;
                }

                if (allTasksCompleted()) {
                        isWorkSession = true;
                        setRemaining(workDuration);
                        updateSessionStatus();
                        updateTaskStatus();
                        updateControls();
                        window.alert('All tasks completed! Timer stopped.');
                        return;
                }

                isWorkSession = true;
                setRemaining(workDuration);
                updateSessionStatus();
                updateTaskStatus();
                updateControls();
                window.alert('Break time is up! Work session starts now.');
                startTicking();
        }

        /* ------------------------------------------------------------------ *
         * Tasks
         * ------------------------------------------------------------------ */

        function getTaskElements() {
                return Array.prototype.slice.call(tasksContainer.querySelectorAll('.task'));
        }

        function isTaskCompleted(taskElement) {
                return taskElement.classList.contains('completed');
        }

        function setTaskCompleted(taskElement, completed) {
                taskElement.classList.toggle('completed', completed);
                const toggle = taskElement.querySelector('.task-text');
                if (toggle) {
                        toggle.setAttribute('aria-checked', String(completed));
                }
        }

        function toggleTask(taskElement) {
                setTaskCompleted(taskElement, !isTaskCompleted(taskElement));
                saveTasks();
        }

        function allTasksCompleted() {
                // With no tasks left there is nothing to work on, so treat the
                // list as complete and let the timer stop instead of looping.
                return getTaskElements().every(isTaskCompleted);
        }

        function completeFirstUncheckedTask() {
                const nextTask = getTaskElements().find(function (taskElement) {
                        return !isTaskCompleted(taskElement);
                });
                if (!nextTask) {
                        return;
                }
                setTaskCompleted(nextTask, true);
                saveTasks();
        }

        function checkTasks() {
                const tasks = getTaskElements();
                if (tasks.length === 0) {
                        window.alert('No tasks available. Please add a task.');
                        return false;
                }
                if (allTasksCompleted()) {
                        window.alert('All tasks are already completed.');
                        return false;
                }
                return true;
        }

        function truncateForLabel(text) {
                return text.length > 80 ? text.slice(0, 77) + '...' : text;
        }

        function createTaskElement(task) {
                const taskElement = document.createElement('div');
                taskElement.className = 'task';

                const text = document.createElement('span');
                text.className = 'task-text';
                text.textContent = task.text;
                text.setAttribute('role', 'checkbox');
                text.setAttribute('aria-checked', 'false');
                text.tabIndex = 0;
                text.addEventListener('keydown', function (event) {
                        if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
                                event.preventDefault();
                                toggleTask(taskElement);
                        }
                });
                taskElement.appendChild(text);

                const removeButton = document.createElement('button');
                removeButton.type = 'button';
                removeButton.textContent = 'Remove';
                removeButton.className = 'remove-task';
                removeButton.setAttribute('aria-label', 'Remove task: ' + truncateForLabel(task.text));
                removeButton.addEventListener('click', function (event) {
                        // Without this the click bubbles to the row and toggles
                        // the task that is being removed.
                        event.stopPropagation();
                        const nextTask = taskElement.nextElementSibling || taskElement.previousElementSibling;
                        taskElement.remove();
                        saveTasks();
                        // Keep keyboard users near where they were instead of
                        // dropping focus onto <body>.
                        if (nextTask) {
                                const nextText = nextTask.querySelector('.task-text');
                                if (nextText) {
                                        nextText.focus();
                                }
                        } else {
                                taskInput.focus();
                        }
                });
                taskElement.appendChild(removeButton);

                taskElement.addEventListener('click', function () {
                        toggleTask(taskElement);
                });

                setTaskCompleted(taskElement, Boolean(task.completed));
                return taskElement;
        }

        function addTask() {
                const taskText = taskInput.value.trim();
                if (!taskText) {
                        taskInput.focus();
                        return;
                }
                if (getTaskElements().length >= MAX_TASKS) {
                        window.alert('Task list is full. Remove a task before adding another.');
                        return;
                }
                tasksContainer.appendChild(createTaskElement({
                        text: taskText.slice(0, MAX_TASK_LENGTH),
                        completed: false
                }));
                taskInput.value = '';
                taskInput.focus();
                updateTaskStatus();
                saveTasks();
        }

        function saveTasks() {
                const tasks = getTaskElements().map(function (taskElement) {
                        const textElement = taskElement.querySelector('.task-text');
                        return {
                                text: textElement ? textElement.textContent : '',
                                completed: isTaskCompleted(taskElement)
                        };
                });
                writeStorage(STORAGE_KEYS.tasks, JSON.stringify(tasks));
        }

        function loadTasks() {
                const raw = readStorage(STORAGE_KEYS.tasks);
                let storedTasks = [];

                if (raw && raw.length <= MAX_STORED_TASKS_LENGTH) {
                        try {
                                const parsed = JSON.parse(raw);
                                if (Array.isArray(parsed)) {
                                        storedTasks = parsed;
                                }
                        } catch (error) {
                                storedTasks = [];
                        }
                }

                getTaskElements().forEach(function (taskElement) {
                        taskElement.remove();
                });

                let addedCount = 0;
                storedTasks.forEach(function (entry) {
                        if (addedCount >= MAX_TASKS) {
                                return;
                        }
                        if (!entry || typeof entry.text !== 'string') {
                                return;
                        }
                        const text = entry.text.trim().slice(0, MAX_TASK_LENGTH);
                        if (!text) {
                                return;
                        }
                        tasksContainer.appendChild(createTaskElement({
                                text: text,
                                completed: entry.completed === true
                        }));
                        addedCount += 1;
                });

                updateTaskStatus();
        }

        /* ------------------------------------------------------------------ *
         * Settings
         * ------------------------------------------------------------------ */

        function parseMinutes(value, fallbackMinutes) {
                return isValidMinutesValue(value) ? Number(value) : fallbackMinutes;
        }

        function readInputMinutes(input, fallbackMinutes) {
                const minutes = parseMinutes(input.value, fallbackMinutes);
                input.value = String(minutes);
                return minutes;
        }

        function saveSettings() {
                writeStorage(STORAGE_KEYS.workDuration, String(Math.round(workDuration / 60)));
                writeStorage(STORAGE_KEYS.breakDuration, String(Math.round(breakDuration / 60)));
        }

        function loadSettings() {
                const workMinutes = parseMinutes(readStorage(STORAGE_KEYS.workDuration), DEFAULT_WORK_MINUTES);
                const breakMinutes = parseMinutes(readStorage(STORAGE_KEYS.breakDuration), DEFAULT_BREAK_MINUTES);

                workDuration = workMinutes * 60;
                breakDuration = breakMinutes * 60;
                workDurationInput.value = String(workMinutes);
                breakDurationInput.value = String(breakMinutes);

                // The display must match the restored configuration right away.
                setRemaining(workDuration);
        }

        /* ------------------------------------------------------------------ *
         * Timer controls
         * ------------------------------------------------------------------ */

        function startTimer() {
                if (state === 'running') {
                        pauseTimer();
                        return;
                }
                if (state === 'paused') {
                        if (currentTime <= 0) {
                                setRemaining(isWorkSession ? workDuration : breakDuration);
                        }
                        startTicking();
                        return;
                }
                if (isWorkSession && !checkTasks()) {
                        return;
                }
                if (currentTime <= 0) {
                        setRemaining(isWorkSession ? workDuration : breakDuration);
                }
                startTicking();
        }

        function pauseTimer() {
                if (state !== 'running') {
                        return;
                }
                const remaining = Math.ceil((deadline - Date.now()) / 1000);
                currentTime = Number.isFinite(remaining) ? Math.max(0, remaining) : 0;
                clearTicking();
                state = 'paused';
                updateTimerDisplay();
                updateControls();
        }

        function resetTimer() {
                stopTicking();
                isWorkSession = true;
                setRemaining(workDuration);
                updateSessionStatus();
                updateTaskStatus();
        }

        function skipSession() {
                const wasRunning = state === 'running';
                stopTicking();

                if (isWorkSession) {
                        completeFirstUncheckedTask();
                        isWorkSession = false;
                        setRemaining(breakDuration);
                        updateSessionStatus();
                        updateTaskStatus();
                        window.alert('Work session skipped! Break time starts now.');
                        if (wasRunning) {
                                startTicking();
                        }
                        return;
                }

                // Leaving a break: do not start a work session if there is
                // nothing left to work on.
                if (allTasksCompleted()) {
                        isWorkSession = true;
                        setRemaining(workDuration);
                        updateSessionStatus();
                        updateTaskStatus();
                        window.alert('All tasks completed! Timer stopped.');
                        return;
                }

                isWorkSession = true;
                setRemaining(workDuration);
                updateSessionStatus();
                updateTaskStatus();
                window.alert('Break session skipped! Work session starts now.');
                if (wasRunning) {
                        startTicking();
                }
        }

        /* ------------------------------------------------------------------ *
         * Wiring
         * ------------------------------------------------------------------ */

        startButton.addEventListener('click', startTimer);
        if (skipButton) {
                skipButton.addEventListener('click', skipSession);
        }
        if (resetButton) {
                resetButton.addEventListener('click', resetTimer);
        }
        addTaskButton.addEventListener('click', addTask);

        taskInput.addEventListener('keydown', function (event) {
                // Do not submit a half-typed task while an IME is composing.
                if (event.isComposing || event.keyCode === 229) {
                        return;
                }
                if (event.key === 'Enter') {
                        event.preventDefault();
                        addTask();
                }
        });

        workDurationInput.addEventListener('change', function () {
                const fallback = Math.round(workDuration / 60);
                workDuration = readInputMinutes(workDurationInput, fallback) * 60;
                saveSettings();
                // Do not throw away an active break; the new duration applies to
                // the next work session. A work countdown must be refreshed now.
                if (isWorkSession) {
                        resetTimer();
                }
        });

        breakDurationInput.addEventListener('change', function () {
                const fallback = Math.round(breakDuration / 60);
                breakDuration = readInputMinutes(breakDurationInput, fallback) * 60;
                saveSettings();
                if (!isWorkSession && state === 'idle') {
                        setRemaining(breakDuration);
                }
        });

        function initialize() {
                migrateStorage();
                loadTasks();
                loadSettings();
                updateSessionStatus();
                updateTaskStatus();
                updateControls();
                updateTimerDisplay();

                const yearElement = document.getElementById('year');
                if (yearElement) {
                        yearElement.textContent = String(new Date().getFullYear());
                }
        }

        // This script is loaded at the end of <body>, so every element above
        // already exists and the timer can be initialized before first paint.
        initialize();
})();
