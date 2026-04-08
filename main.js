let editor = null;
let debugSteps = [];
let currentStep = 0;
let inputResolver = null;
let fileCounter = 1;
let openFiles = {};
let activeFile = "Untitled.py";
let currentHighlightDecoration = null;
let isDarkTheme = true;
const REMOTE_BACKEND_URL = "https://pyvm-backend-1.onrender.com/run";
const MONACO_CDN_BASES = [
    './node_modules/monaco-editor/min/vs',
    'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs',
    'https://unpkg.com/monaco-editor@0.44.0/min/vs'
];
let monacoCdnIndex = 0;
const EDITOR_BOOT_TIMEOUT_MS = 12000;
const scheduleBackgroundTask = window.requestIdleCallback || function(callback) {
    return window.setTimeout(callback, 0);
};
const initialEditorValue = `name = input("Enter your name: ")
age = int(input("Enter your age: "))
print("Hello,", name)
print("You are", age, "years old")

if age >= 18:
    print("You are an adult!")
else:
    print("You are a minor!")`;

function getMonacoCdnBase() {
    return MONACO_CDN_BASES[monacoCdnIndex];
}

function getBackendUrl() {
    const savedBackendUrl = localStorage.getItem('pyvm-backend-url');
    if (savedBackendUrl) {
        return savedBackendUrl;
    }

    const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (window.location.protocol === 'file:' || isLocalHost) {
        return 'http://127.0.0.1:8001/run';
    }

    return REMOTE_BACKEND_URL;
}

function applyTheme() {
    document.body.classList.toggle('light-theme', !isDarkTheme);
    if (editor && window.monaco) {
        monaco.editor.setTheme(isDarkTheme ? 'vs-dark' : 'vs-light');
    }
    localStorage.setItem('pyvm-theme', isDarkTheme ? 'dark' : 'light');
}

function toggleTheme() {
    isDarkTheme = !isDarkTheme;
    applyTheme();
}

function loadSavedTheme() {
    const savedTheme = localStorage.getItem('pyvm-theme');
    if (savedTheme === 'light') {
        isDarkTheme = false;
    }
    applyTheme();
}
function showLoading(message = 'Loading...') {
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.innerHTML = `
        <div class="loading-spinner"></div>
        <div class="loading-text">${message}</div>
    `;
    document.body.appendChild(overlay);
}

function hideLoading() {
    const overlay = document.querySelector('.loading-overlay');
    if (overlay) {
        overlay.remove();
    }
}
function showToast(message, type = 'info', duration = 3000) {
    const container = document.createElement('div');
    container.className = 'toast-container';

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);
    document.body.appendChild(container);
    setTimeout(() => {
        container.remove();
    }, duration);
}

function finalizeEditorBoot() {
    openFiles["Untitled.py"] = editor.getValue();

    requestAnimationFrame(() => {
        if (editor) editor.layout();
        const placeholder = document.getElementById('editor-placeholder');
        if (placeholder) placeholder.remove();
        loadSavedTheme();
    });

    if (editor.onDidChangeModelContent) {
        editor.onDidChangeModelContent(() => {
            openFiles[activeFile] = editor.getValue();
        });
    } else {
        const fallbackInput = document.getElementById('fallback-editor');
        if (fallbackInput) {
            fallbackInput.addEventListener('input', () => {
                openFiles[activeFile] = editor.getValue();
            });
        }
    }

    const firstTab = document.querySelector('.file-tab[data-file="Untitled.py"]');
    if (firstTab) {
        firstTab.addEventListener('click', () => switchToFile("Untitled.py"));
        const closeBtn = firstTab.querySelector('.close-tab');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                closeFile("Untitled.py");
            });
        }
    }

    setupResizer();
}

function createFallbackEditor() {
    const container = document.getElementById('editor-container');
    container.innerHTML = '<textarea id="fallback-editor" spellcheck="false"></textarea>';
    const textarea = document.getElementById('fallback-editor');
    textarea.value = initialEditorValue;

    editor = {
        getValue: () => textarea.value,
        setValue: (value) => { textarea.value = value; },
        layout: () => {},
        focus: () => textarea.focus(),
        updateOptions: () => {},
        onDidChangeModelContent: (handler) => {
            textarea.addEventListener('input', handler);
        },
        deltaDecorations: () => [],
        revealLineInCenter: () => {}
    };

    finalizeEditorBoot();
    showToast('Monaco could not load, using a basic editor fallback.', 'info', 5000);
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(script);
    });
}

async function ensureMonacoLoader() {
    if (window.require && window.require.config) {
        return;
    }

    let lastError = null;
    for (let i = monacoCdnIndex; i < MONACO_CDN_BASES.length; i += 1) {
        monacoCdnIndex = i;
        try {
            await loadScript(`${getMonacoCdnBase()}/loader.js`);
            if (window.require && window.require.config) {
                return;
            }
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError || new Error('Monaco loader did not initialize');
}

const pythonKeywords = [
    'and', 'as', 'assert', 'break', 'class', 'continue', 'def', 'del', 'elif',
    'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in',
    'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try',
    'while', 'with', 'yield', 'True', 'False', 'None'
];

const pythonBuiltins = [
    'abs', 'all', 'any', 'bin', 'bool', 'callable', 'chr', 'classmethod', 'compile',
    'complex', 'delattr', 'dict', 'dir', 'divmod', 'enumerate', 'eval', 'exec',
    'filter', 'float', 'format', 'frozenset', 'getattr', 'globals', 'hasattr',
    'hash', 'help', 'hex', 'id', 'input', 'int', 'isinstance', 'issubclass',
    'iter', 'len', 'list', 'locals', 'map', 'max', 'memoryview', 'min', 'next',
    'object', 'oct', 'open', 'ord', 'pow', 'print', 'property', 'range', 'repr',
    'reversed', 'round', 'set', 'setattr', 'slice', 'sorted', 'staticmethod',
    'str', 'sum', 'super', 'tuple', 'type', 'vars', 'zip'
];

const pyvmFunctions = ['input', 'print'];

const pythonPatterns = [
    { label: 'if', insertText: 'if ${1:condition}:\n    ${2:pass}', detail: 'if statement' },
    { label: 'else', insertText: 'else:\n    ${1:pass}', detail: 'else statement' },
    { label: 'elif', insertText: 'elif ${1:condition}:\n    ${2:pass}', detail: 'elif statement' },
    { label: 'for', insertText: 'for ${1:item} in ${2:iterable}:\n    ${3:pass}', detail: 'for loop' },
    { label: 'while', insertText: 'while ${1:condition}:\n    ${2:pass}', detail: 'while loop' },
    { label: 'def', insertText: 'def ${1:function_name}(${2:args}):\n    ${3:pass}', detail: 'function definition' },
    { label: 'class', insertText: 'class ${1:ClassName}:\n    ${2:pass}', detail: 'class definition' },
    { label: 'try', insertText: 'try:\n    ${1:pass}\nexcept ${2:Exception}:\n    ${3:pass}', detail: 'try-except block' }
];

const pythonCompletions = [
    ...pythonKeywords.map((keyword) => ({
        label: keyword,
        kind: 'keyword',
        insertText: keyword,
        detail: 'Python keyword'
    })),
    ...pythonBuiltins.map((func) => ({
        label: func,
        kind: 'function',
        insertText: func + '()',
        detail: 'Python built-in function'
    })),
    ...pyvmFunctions.map((func) => ({
        label: func,
        kind: 'function',
        insertText: func + '()',
        detail: 'PyVM function'
    })),
    ...pythonPatterns.map((pattern) => ({
        ...pattern,
        kind: 'snippet'
    }))
];

function registerPythonEnhancements() {
    monaco.languages.registerCompletionItemProvider('python', {
        provideCompletionItems: function(model, position) {
            const word = model.getWordUntilPosition(position);
            const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn
            };

            const suggestions = pythonCompletions.map((item) => ({
                label: item.label,
                kind: item.kind === 'keyword'
                    ? monaco.languages.CompletionItemKind.Keyword
                    : item.kind === 'snippet'
                        ? monaco.languages.CompletionItemKind.Snippet
                        : monaco.languages.CompletionItemKind.Function,
                insertText: item.insertText,
                range,
                detail: item.detail,
                insertTextRules: item.kind === 'keyword'
                    ? undefined
                    : monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
            }));

            return { suggestions };
        }
    });

    monaco.languages.registerHoverProvider('python', {
        provideHover: function(model, position) {
            const word = model.getWordAtPosition(position);
            if (!word) return;

            const wordText = word.word;
            let contents = [];

            if (wordText === 'print') {
                contents = [{ value: '**print()**\\n\\nPrints values to the output\\n\\n`print(value, ...)`' }];
            } else if (wordText === 'input') {
                contents = [{ value: '**input()**\\n\\nGets input from user\\n\\n`input(prompt="")`' }];
            } else if (pythonKeywords.includes(wordText)) {
                contents = [{ value: `**${wordText}**\\n\\nPython keyword` }];
            } else if (pythonBuiltins.includes(wordText)) {
                contents = [{ value: `**${wordText}()**\\n\\nPython built-in function` }];
            }

            if (contents.length > 0) {
                return {
                    range: word,
                    contents
                };
            }
        }
    });
}

function bootMonacoEditor() {
    if (!window.require || !window.require.config) {
        return false;
    }

    window.require.config({
        paths: { vs: getMonacoCdnBase() },
        'vs/nls': { availableLanguages: { '*': '' } }
    });

    window.MonacoEnvironment = {
        getWorkerUrl: function () {
            return `data:text/javascript;charset=utf-8,${encodeURIComponent(`
                self.MonacoEnvironment = { baseUrl: '${getMonacoCdnBase()}/' };
                importScripts('${getMonacoCdnBase()}/base/worker/workerMain.js');
            `)}`;
        }
    };

    window.require(['vs/editor/editor.main'], function () {
        monaco.languages.register({ id: 'python' });

        editor = monaco.editor.create(document.getElementById('editor-container'), {
        value: initialEditorValue,
        language: 'python',
        theme: 'vs-dark',
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 14,
        lineNumbers: 'on',
        wordWrap: 'on',
        scrollBeyondLastLine: false,
        scrollbar: {
            vertical: 'auto',
            horizontal: 'auto',
            useShadows: false,
        },
        suggestOnTriggerCharacters: false,
        quickSuggestions: false,
        parameterHints: { enabled: true },
        hover: { enabled: false },
        contextmenu: true,
        folding: true,
        bracketPairColorization: { enabled: true },
        suggest: {
            showKeywords: true,
            showSnippets: true,
            showFunctions: true
        }
    });

        finalizeEditorBoot();

        scheduleBackgroundTask(() => {
            registerPythonEnhancements();
            editor.updateOptions({
                suggestOnTriggerCharacters: true,
                quickSuggestions: true,
                hover: { enabled: true }
            });
        });
    }, function () {
        if (monacoCdnIndex < MONACO_CDN_BASES.length - 1) {
            monacoCdnIndex += 1;
            bootMonacoEditor();
            return;
        }
        if (!editor) {
            createFallbackEditor();
        }
    });

    return true;
}

async function startEditor() {
    try {
        await ensureMonacoLoader();
        const booted = bootMonacoEditor();
        if (!booted) {
            createFallbackEditor();
        }
    } catch (_error) {
        createFallbackEditor();
        return;
    }

    window.setTimeout(() => {
        if (!editor) {
            createFallbackEditor();
        }
    }, EDITOR_BOOT_TIMEOUT_MS);
}

startEditor();
function setupResizer() {
    const resizer  = document.getElementById('resizer');
    const editorSection = document.getElementById('editor-section');
    const rightPanel    = document.getElementById('right-panel');
    const container     = document.querySelector('.container');

    let dragging = false;

    resizer.addEventListener('mousedown', (e) => {
        dragging = true;
        resizer.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;

        const rect = container.getBoundingClientRect();
        let offsetX = e.clientX - rect.left;
        const minPx = 150;
        const maxPx = rect.width - minPx - resizer.offsetWidth;
        offsetX = Math.max(minPx, Math.min(offsetX, maxPx));
        editorSection.style.flexBasis = offsetX + 'px';
        editorSection.style.flexGrow  = '0';
        editorSection.style.flexShrink = '0';

        rightPanel.style.flexBasis = '';
        rightPanel.style.flexGrow  = '1';
        rightPanel.style.flexShrink = '1';
        if (editor) editor.layout();
    });

    document.addEventListener('mouseup', () => {
        if (!dragging) return;
        dragging = false;
        resizer.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        if (editor) editor.layout();
    });
}
function createNewFile() {
    openFiles[activeFile] = editor.getValue();
    showFileNamePrompt();
}
function showFileNamePrompt() {
    if (document.getElementById('filename-prompt')) return;

    const tabsContainer = document.getElementById('file-tabs');
    const newBtn = tabsContainer.querySelector('.new-file-btn');

    const wrapper = document.createElement('div');
    wrapper.id = 'filename-prompt';
    wrapper.style.cssText = `
        display: flex; align-items: center; gap: 4px;
        padding: 0 6px; height: 100%; flex-shrink: 0;
        background: #1e293b; border-right: 1px solid #334155;
    `;

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.placeholder = 'filename.py';
    inp.value = `File${fileCounter + 1}.py`;
    inp.style.cssText = `
        width: 100px; padding: 2px 6px;
        background: #0f172a; border: 1px solid #22c55e;
        border-radius: 3px; color: #e2e8f0;
        font-family: monospace; font-size: 12px;
        outline: none;
    `;

    wrapper.append(inp);
    tabsContainer.insertBefore(wrapper, newBtn);
    inp.focus();
    inp.select();

    const confirm = () => {
        let name = inp.value.trim();
        if (!name) return;
        if (!name.endsWith('.py')) name += '.py';
        if (openFiles[name] !== undefined) {
            inp.style.borderColor = '#ef4444';
            inp.title = 'File already exists';
            inp.focus();
            return;
        }

        wrapper.remove();
        fileCounter++;

        openFiles[name] = 'print("Hello, PyVM!")';
        addFileTab(name);
        switchToFile(name);
    };

    const abort = () => wrapper.remove();

    inp.addEventListener('blur', () => setTimeout(abort, 100));
    inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter')  confirm();
        if (e.key === 'Escape') abort();
        e.stopPropagation();
    });
}

function addFileTab(fileName) {
    const tabsContainer = document.getElementById('file-tabs');
    const newBtn = tabsContainer.querySelector('.new-file-btn');

    const tab = document.createElement('div');
    tab.className = 'file-tab';
    tab.setAttribute('data-file', fileName);
    tab.innerHTML = `
        <span title="${fileName}">${fileName}</span>
        <button class="close-tab" onclick="event.stopPropagation(); closeFile('${fileName}')">&times;</button>
    `;
    tab.addEventListener('click', () => switchToFile(fileName));
    tabsContainer.insertBefore(tab, newBtn);
}

function switchToFile(fileName) {
    if (activeFile && editor) {
        openFiles[activeFile] = editor.getValue();
    }

    activeFile = fileName;

    document.querySelectorAll('.file-tab').forEach(t => {
        t.classList.toggle('active', t.getAttribute('data-file') === fileName);
    });

    if (editor && openFiles[fileName] !== undefined) {
        editor.setValue(openFiles[fileName]);
    }

    if (editor) editor.focus();
}

function closeFile(fileName) {
    const tabs = document.querySelectorAll('.file-tab');
    if (tabs.length <= 1) {
        alert("Cannot close the last file!");
        return;
    }

    delete openFiles[fileName];

    const tab = document.querySelector(`.file-tab[data-file="${fileName}"]`);
    if (tab) tab.remove();

    if (activeFile === fileName) {
        const remaining = document.querySelectorAll('.file-tab');
        if (remaining.length > 0) {
            switchToFile(remaining[0].getAttribute('data-file'));
        }
    }
}
function showInputDialog(prompt) {
    return new Promise((resolve) => {
        const outputEl = document.getElementById('output');
        if (outputEl.classList.contains('hidden')) {
            showTab('output');
        }

        inputResolver = resolve;

        const dialog  = document.getElementById('input-dialog');
        const promptEl = document.getElementById('input-prompt');
        const inputEl  = document.getElementById('input-value');

        promptEl.textContent = prompt;
        inputEl.value = '';
        dialog.classList.remove('hidden');
        inputEl.focus();

        inputEl.onkeydown = (e) => {
            if (e.key === 'Enter')  submitInput();
            if (e.key === 'Escape') cancelInput();
        };
    });
}

function submitInput() {
    const val = document.getElementById('input-value').value;
    document.getElementById('input-dialog').classList.add('hidden');
    if (inputResolver) { inputResolver(val); inputResolver = null; }
}

function cancelInput() {
    document.getElementById('input-dialog').classList.add('hidden');
    if (inputResolver) { inputResolver(null); inputResolver = null; }
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatDebugValue(value) {
    if (value === null || value === undefined) {
        return 'None';
    }
    if (typeof value === 'string') {
        return value;
    }
    return JSON.stringify(value, null, 2);
}

function renderBytecodePanel(bytecode) {
    const container = document.getElementById("bytecode");
    if (!bytecode || bytecode.length === 0) {
        container.innerHTML = '<div class="trace-empty">No bytecode generated yet. Run a program to see the compiler output.</div>';
        return;
    }

    container.innerHTML = `
        <div class="trace-intro">
            <div class="trace-title">Compiled Bytecode</div>
            <div class="trace-subtitle">This is the instruction list produced by the compiler before execution starts.</div>
        </div>
        <div class="trace-list">
            ${bytecode.map((instr, index) => `
                <div class="trace-card">
                    <div class="trace-card-header">
                        <div class="trace-card-title">Instruction ${index}</div>
                        <div class="trace-badge">${escapeHtml(String(instr[0] ?? ''))}</div>
                    </div>
                    <div class="trace-card-body">
                        <div class="trace-field">
                            <span class="trace-field-label">Operand</span>
                            <div class="trace-field-value">${escapeHtml(instr[1] === null || instr[1] === undefined ? 'None' : String(instr[1]))}</div>
                        </div>
                        <div class="trace-field">
                            <span class="trace-field-label">Source Line</span>
                            <div class="trace-field-value">${escapeHtml(String(instr[2] ?? 'N/A'))}</div>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderVmTracePanel(debugSteps) {
    const container = document.getElementById("vm");
    if (!debugSteps || debugSteps.length === 0) {
        container.innerHTML = '<div class="trace-empty">No VM trace available yet. Run a program to see execution steps.</div>';
        return;
    }

    container.innerHTML = `
        <div class="trace-intro">
            <div class="trace-title">VM Execution Trace</div>
            <div class="trace-subtitle">This shows how the virtual machine executed the bytecode step by step, including stack and variable changes.</div>
        </div>
        <div class="trace-list">
            ${debugSteps.map((step) => `
                <div class="trace-card">
                    <div class="trace-card-header">
                        <div class="trace-card-title">Step ${escapeHtml(String(step.step))}</div>
                        <div class="trace-badge">${escapeHtml(String(step.op || ''))}</div>
                    </div>
                    <div class="trace-card-body">
                        <div class="trace-field">
                            <span class="trace-field-label">Operand</span>
                            <div class="trace-field-value">${escapeHtml(step.val === null || step.val === undefined ? 'None' : String(step.val))}</div>
                        </div>
                        <div class="trace-field">
                            <span class="trace-field-label">Source Line</span>
                            <div class="trace-field-value">${escapeHtml(step.line && step.line > 0 ? String(step.line) : 'N/A')}</div>
                        </div>
                        <div class="trace-field">
                            <span class="trace-field-label">Stack After Step</span>
                            <div class="trace-field-value">${escapeHtml(formatDebugValue(step.stack || []))}</div>
                        </div>
                        <div class="trace-field">
                            <span class="trace-field-label">Variables After Step</span>
                            <div class="trace-field-value">${escapeHtml(formatDebugValue(step.vars || {}))}</div>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function applyRunResponse(data) {
    const outputEl = document.getElementById("output");
    outputEl.innerText = data.output || "";
    renderBytecodePanel(data.bytecode || []);
    renderVmTracePanel(data.debug || []);

    debugSteps  = data.debug || [];
    currentStep = 0;
    renderStep();
}
async function runCode() {
    const code = editor.getValue();
    let inputs = [];

    try {
        let data;
        while (true) {
            const res = await fetch(getBackendUrl(), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code, inputs })
            });
            data = await res.json();
            applyRunResponse(data);

            if (data.status !== 'needs_input') {
                break;
            }

            showTab('output');

            const userInput = await showInputDialog(data.input_prompt || "Enter input:");
            if (userInput === null) {
                showToast('Execution cancelled.', 'info');
                return;
            }
            inputs.push(userInput);
        }
        
        showToast('Code executed successfully!', 'success');
    } catch (err) {
        document.getElementById("output").innerText = "Error: Could not connect to backend.\n" + err.message;
        showTab('output');
        showToast('Connection error! Check backend URL.', 'error');
    }
}
function exportCurrentFile() {
    if (activeFile && editor) {
        openFiles[activeFile] = editor.getValue();
    }

    const fileName = activeFile || 'untitled.py';
    const fileContents = openFiles[fileName] || '';
    const blob = new Blob([fileContents], { type: 'text/x-python' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName.endsWith('.py') ? fileName : `${fileName}.py`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('Current file exported successfully!', 'success');
}

function importFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.py,.json,.pyvm,text/x-python,text/plain,application/json';
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                const content = event.target.result;
                const fileName = file.name || 'imported.py';

                const lowerFileName = fileName.toLowerCase();
                if (lowerFileName.endsWith('.py')) {
                    importPythonFile(fileName, content);
                    showToast('Python file imported successfully!', 'success');
                    return;
                }

                const projectData = JSON.parse(content);
                importProjectData(projectData);
                showToast('Project imported successfully!', 'success');
            } catch (err) {
                showToast('Import a .py file or a valid project file.', 'error');
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

function importPythonFile(fileName, content) {
    if (!document.querySelector(`.file-tab[data-file="${fileName}"]`)) {
        addFileTab(fileName);
    }

    openFiles[fileName] = content;
    switchToFile(fileName);
}

function importProjectData(projectData) {
    Object.assign(openFiles, projectData.files || {});

    Object.keys(projectData.files || {}).forEach(fileName => {
        if (!document.querySelector(`.file-tab[data-file="${fileName}"]`)) {
            addFileTab(fileName);
        }
    });

    if (projectData.activeFile && openFiles[projectData.activeFile]) {
        switchToFile(projectData.activeFile);
    }
}
function renderStep() {
    const container = document.getElementById("debug-content");
    const counter   = document.getElementById("step-counter");

    if (!debugSteps.length) {
        container.innerText = "No debug data available.";
        counter.innerText   = "Step 0/0";
        clearLineHighlight();
        renderVisualStack([]);
        renderVisualVariables({});
        return;
    }

    const step = debugSteps[currentStep];
    const operandText = step.val === null || step.val === undefined ? "" : String(step.val);
    const lineText = step.line === null || step.line === undefined || step.line <= 0 ? "N/A" : step.line;
    if (step.line > 0) {
        highlightLine(step.line);
    } else {
        clearLineHighlight();
    }

    container.innerText =
`Step ${step.step}
Operation : ${step.op} ${operandText}
Line      : ${lineText}
Stack     : ${JSON.stringify(step.stack, null, 2)}
Variables : ${JSON.stringify(step.vars,  null, 2)}`;

    counter.innerText = `Step ${currentStep + 1} / ${debugSteps.length}`;
    renderVisualStack(step.stack || []);
    renderVisualVariables(step.vars || {});
}
function renderVisualStack(stack) {
    const container = document.getElementById('stack-visual');

    if (!stack || stack.length === 0) {
        container.innerHTML = '<div class="stack-empty">Stack is empty</div>';
        return;
    }
    container.innerHTML = '';

    stack.slice().reverse().forEach((item, index) => {
        const stackItem = document.createElement('div');
        stackItem.className = 'stack-item';
        if (index === 0) {
            stackItem.classList.add('top');
        }
        let displayValue = String(item);
        if (displayValue.length > 30) {
            displayValue = displayValue.substring(0, 27) + '...';
        }
        displayValue = displayValue
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        stackItem.innerHTML = `
            ${displayValue}
            <span class="stack-index">#${stack.length - index}</span>
        `;

        container.appendChild(stackItem);
    });
}
function renderVisualVariables(vars) {
    const container = document.getElementById('vars-visual');

    if (!vars || Object.keys(vars).length === 0) {
        container.innerHTML = '<div class="vars-empty">No variables</div>';
        return;
    }
    container.innerHTML = '';

    Object.entries(vars).forEach(([name, value]) => {
        const varItem = document.createElement('div');
        varItem.className = 'var-item';
        let displayValue = String(value);
        if (displayValue.length > 50) {
            displayValue = displayValue.substring(0, 47) + '...';
        }
        displayValue = displayValue
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        varItem.innerHTML = `
            <div class="var-name">${name}</div>
            <div class="var-value">${displayValue}</div>
        `;

        container.appendChild(varItem);
    });
}
function highlightLine(lineNumber) {
    if (!editor || !window.monaco || lineNumber <= 0) return;
    if (currentHighlightDecoration) {
        editor.deltaDecorations([currentHighlightDecoration], []);
    }
    const decorations = [{
        range: new monaco.Range(lineNumber, 1, lineNumber, 1),
        options: {
            isWholeLine: true,
            className: 'current-line-highlight',
            glyphMarginClassName: 'current-line-glyph',
            minimap: {
                color: '#22c55e',
                position: monaco.editor.MinimapPosition.Inline
            }
        }
    }];

    currentHighlightDecoration = editor.deltaDecorations([], decorations)[0];
    editor.revealLineInCenter(lineNumber);
}

function clearLineHighlight() {
    if (currentHighlightDecoration && editor && window.monaco) {
        editor.deltaDecorations([currentHighlightDecoration], []);
        currentHighlightDecoration = null;
    }
}

function nextStep() {
    if (currentStep < debugSteps.length - 1) { currentStep++; renderStep(); }
}
function prevStep() {
    if (currentStep > 0) { currentStep--; renderStep(); }
}
function showTab(tabName, btn) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
    document.getElementById(tabName).classList.remove('hidden');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    if (btn) {
        btn.classList.add('active');
    } else {
        document.querySelectorAll('.tab-btn').forEach(b => {
            if (b.textContent.toLowerCase() === tabName) b.classList.add('active');
        });
    }
}
function clearOutput() {
    document.getElementById("output").innerText       = "";
    document.getElementById("bytecode").innerText     = "";
    document.getElementById("vm").innerText           = "";
    document.getElementById("debug-content").innerText = "";
    debugSteps  = [];
    currentStep = 0;
    clearLineHighlight();
    renderStep();
}
