// ===== STATE =====
let editor = null;
let debugSteps = [];
let currentStep = 0;
let inputResolver = null;
let fileCounter = 1;
let openFiles = {};
let activeFile = "Untitled.py";
let namingResolver = null;
let currentHighlightDecoration = null; // Track current line highlight
let isDarkTheme = true; // Track theme state
let executionStartTime = 0; // Track execution time
let memoryUsage = { peak: 0, current: 0 }; // Track memory usage

// ===== THEME TOGGLE =====
function toggleTheme() {
    isDarkTheme = !isDarkTheme;
    const body = document.body;
    const themeToggle = document.getElementById('theme-toggle');
    
    if (isDarkTheme) {
        body.classList.remove('light-theme');
        themeToggle.textContent = '🌙';
        localStorage.setItem('pyvm-theme', 'dark');
    } else {
        body.classList.add('light-theme');
        themeToggle.textContent = '🌞';
        localStorage.setItem('pyvm-theme', 'light');
    }
    
    // Update Monaco theme
    if (editor) {
        monaco.editor.setTheme(isDarkTheme ? 'vs-dark' : 'vs-light');
    }
}

// Load saved theme on startup
function loadSavedTheme() {
    const savedTheme = localStorage.getItem('pyvm-theme');
    if (savedTheme === 'light') {
        isDarkTheme = false;
        document.body.classList.add('light-theme');
        document.getElementById('theme-toggle').textContent = '🌞';
    }
}

// ===== LOADING ANIMATION =====
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

// ===== ERROR MESSAGES =====
function showToast(message, type = 'info', duration = 3000) {
    const container = document.createElement('div');
    container.className = 'toast-container';
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    document.body.appendChild(container);
    
    // Auto remove
    setTimeout(() => {
        container.remove();
    }, duration);
}

// ===== MONACO SETUP =====
require.config({
    paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' },
    'vs/nls': { availableLanguages: { '*': '' } }
});

// Disable heavy workers — speeds up initial load significantly
window.MonacoEnvironment = {
    getWorkerUrl: function () {
        return `data:text/javascript;charset=utf-8,${encodeURIComponent(`
            self.MonacoEnvironment = { baseUrl: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/' };
            importScripts('https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs/base/worker/workerMain.js');
        `)}`;
    }
};
require(['vs/editor/editor.main'], function () {
    // ===== PYTHON LANGUAGE CONFIGURATION =====
    monaco.languages.register({ id: 'python' });
    
    // Python keywords for autocomplete
    const pythonKeywords = [
        'and', 'as', 'assert', 'break', 'class', 'continue', 'def', 'del', 'elif', 
        'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 
        'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 
        'while', 'with', 'yield', 'True', 'False', 'None'
    ];
    
    // Python built-in functions
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
    
    // PyVM-specific functions
    const pyvmFunctions = [
        'input', 'print'
    ];
    
    // Register completion provider
    monaco.languages.registerCompletionItemProvider('python', {
        provideCompletionItems: function(model, position) {
            const word = model.getWordUntilPosition(position);
            const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn
            };
            
            const suggestions = [];
            
            // Add keywords
            pythonKeywords.forEach(keyword => {
                suggestions.push({
                    label: keyword,
                    kind: monaco.languages.CompletionItemKind.Keyword,
                    insertText: keyword,
                    range: range,
                    detail: 'Python keyword'
                });
            });
            
            // Add built-in functions
            pythonBuiltins.forEach(func => {
                suggestions.push({
                    label: func,
                    kind: monaco.languages.CompletionItemKind.Function,
                    insertText: func + '()',
                    range: range,
                    detail: 'Python built-in function',
                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                });
            });
            
            // Add PyVM functions
            pyvmFunctions.forEach(func => {
                suggestions.push({
                    label: func,
                    kind: monaco.languages.CompletionItemKind.Function,
                    insertText: func + '()',
                    range: range,
                    detail: 'PyVM function',
                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                });
            });
            
            // Add common Python patterns
            const patterns = [
                { label: 'if', insertText: 'if ${1:condition}:\n    ${2:pass}', detail: 'if statement' },
                { label: 'else', insertText: 'else:\n    ${1:pass}', detail: 'else statement' },
                { label: 'elif', insertText: 'elif ${1:condition}:\n    ${2:pass}', detail: 'elif statement' },
                { label: 'for', insertText: 'for ${1:item} in ${2:iterable}:\n    ${3:pass}', detail: 'for loop' },
                { label: 'while', insertText: 'while ${1:condition}:\n    ${2:pass}', detail: 'while loop' },
                { label: 'def', insertText: 'def ${1:function_name}(${2:args}):\n    ${3:pass}', detail: 'function definition' },
                { label: 'class', insertText: 'class ${1:ClassName}:\n    ${2:pass}', detail: 'class definition' },
                { label: 'try', insertText: 'try:\n    ${1:pass}\nexcept ${2:Exception}:\n    ${3:pass}', detail: 'try-except block' }
            ];
            
            patterns.forEach(pattern => {
                suggestions.push({
                    label: pattern.label,
                    kind: monaco.languages.CompletionItemKind.Snippet,
                    insertText: pattern.insertText,
                    range: range,
                    detail: pattern.detail,
                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                });
            });
            
            return { suggestions };
        }
    });
    
    // Register hover provider for documentation
    monaco.languages.registerHoverProvider('python', {
        provideHover: function(model, position) {
            const word = model.getWordAtPosition(position);
            if (!word) return;
            
            const wordText = word.word;
            let contents = [];
            
            // Provide documentation for common functions
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
                    contents: contents
                };
            }
        }
    });
    
    // ===== CREATE EDITOR =====
    editor = monaco.editor.create(document.getElementById('editor-container'), {
        value: `# Welcome to PyVM - Python Virtual Machine
# Try writing some code with input!

name = input("Enter your name: ")
age = int(input("Enter your age: "))
print("Hello,", name)
print("You are", age, "years old")

if age >= 18:
    print("You are an adult!")
else:
    print("You are a minor!")`,
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
        // Enable autocomplete and other features
        suggestOnTriggerCharacters: true,
        quickSuggestions: true,
        parameterHints: { enabled: true },
        hover: { enabled: true },
        contextmenu: true,
        folding: true,
        bracketPairColorization: { enabled: true },
        suggest: {
            showKeywords: true,
            showSnippets: true,
            showFunctions: true
        }
    });

    openFiles["Untitled.py"] = editor.getValue();

    // Force Monaco to render content immediately after first paint
    requestAnimationFrame(() => {
        editor.layout();
        const placeholder = document.getElementById('editor-placeholder');
        if (placeholder) placeholder.remove();
        
        // Load saved theme
        loadSavedTheme();
    });

    editor.onDidChangeModelContent(() => {
        openFiles[activeFile] = editor.getValue();
    });

    // Wire the first tab rendered statically in HTML
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
});

// ===== RESIZER =====
// The key fix: use percentage-based flex on the container children and
// trigger editor.layout() after every resize so Monaco redraws correctly.
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
        // Position of mouse relative to container left edge
        let offsetX = e.clientX - rect.left;

        // Clamp so neither panel gets too small (min 150px)
        const minPx = 150;
        const maxPx = rect.width - minPx - resizer.offsetWidth;
        offsetX = Math.max(minPx, Math.min(offsetX, maxPx));

        // Apply as pixel widths; use flex-basis so flex children respect it
        editorSection.style.flexBasis = offsetX + 'px';
        editorSection.style.flexGrow  = '0';
        editorSection.style.flexShrink = '0';

        rightPanel.style.flexBasis = '';
        rightPanel.style.flexGrow  = '1';
        rightPanel.style.flexShrink = '1';

        // Force Monaco to recalculate its size immediately
        if (editor) editor.layout();
    });

    document.addEventListener('mouseup', () => {
        if (!dragging) return;
        dragging = false;
        resizer.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        // Final layout pass after drag ends
        if (editor) editor.layout();
    });
}

// ===== FILE MANAGEMENT =====
function createNewFile() {
    openFiles[activeFile] = editor.getValue();
    showFileNamePrompt();
}

// Show a compact inline name input just after the + button
function showFileNamePrompt() {
    // Prevent double prompt
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

        // Avoid duplicate names
        if (openFiles[name] !== undefined) {
            inp.style.borderColor = '#ef4444';
            inp.title = 'File already exists';
            inp.focus();
            return;
        }

        wrapper.remove();
        fileCounter++;

        openFiles[name] = `# ${name}\nprint("Hello, PyVM!")`;
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
    // Insert before the + button (last child)
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

// ===== INPUT DIALOG =====
function showInputDialog(prompt) {
    return new Promise((resolve) => {
        // Make sure Output tab is visible
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

// ===== RUN CODE =====
async function runCode() {
    executionStartTime = performance.now();
    
    const code = editor.getValue();
    let inputs = [];

    if (code.includes('input(')) {
        const inputMatches = code.match(/input\([^)]*\)/g) || [];
        for (const match of inputMatches) {
            const promptMatch = match.match(/input\(\s*["']([^"']+)["']\s*\)/);
            const promptText  = promptMatch ? promptMatch[1] : "Enter input: ";
            const userInput   = await showInputDialog(promptText);
            if (userInput === null) return; // cancelled
            inputs.push(userInput);
        }
    }

    try {
        const res = await fetch("https://pyvm-backend-1.onrender.com/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, inputs })
        });
        const data = await res.json();
        
        const executionTime = Math.round(performance.now() - executionStartTime);
        updateStats(executionTime, data.memory_usage || 0);

        document.getElementById("output").innerText   = data.output;
        document.getElementById("bytecode").innerText = JSON.stringify(data.bytecode, null, 2);
        document.getElementById("vm").innerText       = data.vm_trace;

        debugSteps  = data.debug || [];
        currentStep = 0;
        renderStep();
        
        showToast('Code executed successfully!', 'success');
    } catch (err) {
        document.getElementById("output").innerText = "Error: Could not connect to backend.\n" + err.message;
        showTab('output');
        showToast('Connection error! Check backend URL.', 'error');
    }
}

// ===== STATS TRACKING =====
function updateStats(executionTime, memoryUsage) {
    document.getElementById('execution-time').textContent = `${executionTime}ms`;
    
    // Update memory (simulate based on code complexity)
    const estimatedMemory = Math.round(editor.getValue().length * 0.1 + memoryUsage);
    memoryUsage.current = estimatedMemory;
    memoryUsage.peak = Math.max(memoryUsage.peak, estimatedMemory);
    
    document.getElementById('memory-current').textContent = `${memoryUsage.current} KB`;
    document.getElementById('memory-peak').textContent = `${memoryUsage.peak} KB`;
}

// ===== EXPORT/IMPORT =====
function exportProject() {
    const projectData = {
        files: openFiles,
        activeFile: activeFile,
        timestamp: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pyvm-project-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('Project exported successfully!', 'success');
}

function importProject() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                const projectData = JSON.parse(event.target.result);
                
                // Import files
                Object.assign(openFiles, projectData.files || {});
                
                // Update UI
                Object.keys(projectData.files || {}).forEach(fileName => {
                    if (!document.querySelector(`[data-file="${fileName}"]`)) {
                        addFileTab(fileName);
                    }
                });
                
                // Switch to active file
                if (projectData.activeFile && openFiles[projectData.activeFile]) {
                    switchToFile(projectData.activeFile);
                }
                
                showToast('Project imported successfully!', 'success');
            } catch (err) {
                showToast('Invalid project file!', 'error');
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

// ===== DEBUG =====
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
    
    // Update line highlighting
    if (step.line > 0) {
        highlightLine(step.line);
    } else {
        clearLineHighlight();
    }

    container.innerText =
`Step ${step.step}
Operation : ${step.op} ${step.val || ""}
Line      : ${step.line || 'N/A'}
Stack     : ${JSON.stringify(step.stack, null, 2)}
Variables : ${JSON.stringify(step.vars,  null, 2)}`;

    counter.innerText = `Step ${currentStep + 1} / ${debugSteps.length}`;
    
    // Update visual panels
    renderVisualStack(step.stack || []);
    renderVisualVariables(step.vars || {});
}

// ===== VISUAL STACK =====
function renderVisualStack(stack) {
    const container = document.getElementById('stack-visual');
    
    if (!stack || stack.length === 0) {
        container.innerHTML = '<div class="stack-empty">Stack is empty</div>';
        return;
    }
    
    // Clear and rebuild stack (reverse order for visual - top at top)
    container.innerHTML = '';
    
    stack.slice().reverse().forEach((item, index) => {
        const stackItem = document.createElement('div');
        stackItem.className = 'stack-item';
        
        // Highlight top of stack
        if (index === 0) {
            stackItem.classList.add('top');
        }
        
        // Format value for display
        let displayValue = String(item);
        if (displayValue.length > 30) {
            displayValue = displayValue.substring(0, 27) + '...';
        }
        
        // Escape HTML to prevent issues
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

// ===== VISUAL VARIABLES =====
function renderVisualVariables(vars) {
    const container = document.getElementById('vars-visual');
    
    if (!vars || Object.keys(vars).length === 0) {
        container.innerHTML = '<div class="vars-empty">No variables</div>';
        return;
    }
    
    // Clear and rebuild variables
    container.innerHTML = '';
    
    Object.entries(vars).forEach(([name, value]) => {
        const varItem = document.createElement('div');
        varItem.className = 'var-item';
        
        // Format value for display
        let displayValue = String(value);
        if (displayValue.length > 50) {
            displayValue = displayValue.substring(0, 47) + '...';
        }
        
        // Escape HTML
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

// ===== LINE HIGHLIGHTING =====
function highlightLine(lineNumber) {
    if (!editor || lineNumber <= 0) return;

    // Clear previous highlight
    if (currentHighlightDecoration) {
        editor.deltaDecorations([currentHighlightDecoration], []);
    }

    // Add new highlight
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
    
    // Scroll to the highlighted line
    editor.revealLineInCenter(lineNumber);
}

function clearLineHighlight() {
    if (currentHighlightDecoration && editor) {
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

// ===== TABS =====
function showTab(tabName, btn) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
    document.getElementById(tabName).classList.remove('hidden');

    // Update active button styling
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    if (btn) {
        btn.classList.add('active');
    } else {
        // Find by matching text
        document.querySelectorAll('.tab-btn').forEach(b => {
            if (b.textContent.toLowerCase() === tabName) b.classList.add('active');
        });
    }
}

// ===== CLEAR =====
function clearOutput() {
    document.getElementById("output").innerText       = "";
    document.getElementById("bytecode").innerText     = "";
    document.getElementById("vm").innerText           = "";
    document.getElementById("debug-content").innerText = "";
    debugSteps  = [];
    currentStep = 0;
    clearLineHighlight(); // Clear line highlight when clearing output
    renderStep();
}