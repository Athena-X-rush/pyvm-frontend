# 🖥️ Python Interpreter – Frontend

A web-based interface for a custom Python Interpreter that allows users to write and execute Python code directly in the browser.

---

## 📌 Overview

This frontend provides an interactive coding environment using the Monaco Editor (same as VS Code). It connects to a Flask backend that processes Python code through a custom interpreter (Lexer → Parser → Bytecode → Virtual Machine).

---

## ✨ Features

- Smart code editor (Monaco Editor)
- Run button to execute code
- Sends code to backend API
- Displays output and errors
- Simple and responsive UI

---

## 🛠️ Tech Stack

- HTML5
- CSS3
- JavaScript (Vanilla JS)
- Monaco Editor (via CDN)

---

## 📁 Folder Structure

frontend/
│── index.html      # Main UI  
│── style.css       # Styling  
│── main.js         # Handles logic & API calls  

---

## ⚙️ How It Works

1. User writes Python code in the editor  
2. Clicks the Run button  
3. main.js sends the code to backend using fetch()  
4. Backend processes:
   - Lexer  
   - Parser  
   - Bytecode Compiler  
   - Virtual Machine  
5. Output is returned and displayed  

---

## 🔌 API Endpoint

POST /run

### Request
{
  "code": "print('Hello World')"
}

### Response
{
  "output": "Hello World"
}

---

## 🌐 Monaco Editor CDN

https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/

---

## ▶️ Running Locally

Option 1: Open index.html directly in browser  

Option 2 (Recommended):
Use VS Code Live Server  
Right click → Open with Live Server  

---

## ⚠️ Notes

- Backend must be running for code execution  
- First run may be slow due to cold start (Render/Vercel issue)  

---

## 🚀 Future Improvements

- Syntax error highlighting  
- Dark/Light mode  
- Save code feature  
- Multi-language support  

---

## 👨‍💻 Author

Mayank Bisht 

Role: Frontend Development & API Integration  

---
