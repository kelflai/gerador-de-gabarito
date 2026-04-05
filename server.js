const express = require("express");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "gerador-gabarito-seguro";
const dataDir = path.join(__dirname, "data");
const dbPath = path.join(dataDir, "gabarito.db");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS exams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      class_name TEXT NOT NULL,
      shift TEXT NOT NULL,
      subject TEXT NOT NULL,
      question_count INTEGER NOT NULL,
      choice_count INTEGER NOT NULL,
      official_answers TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      student_name TEXT NOT NULL,
      class_name TEXT NOT NULL,
      shift TEXT NOT NULL,
      subject TEXT NOT NULL,
      student_answers TEXT NOT NULL,
      score INTEGER NOT NULL,
      total_questions INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(exam_id) REFERENCES exams(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);
});

app.use(express.json({ limit: "2mb" }));

function run(query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }
      resolve(this);
    });
  });
}

function get(query, params = []) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(row);
    });
  });
}

function all(query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(rows);
    });
  });
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) {
    res.status(401).json({ error: "Acesso nao autorizado." });
    return;
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (error) {
    res.status(401).json({ error: "Sessao invalida ou expirada." });
  }
}

function sanitizeExam(row) {
  return {
    id: row.id,
    title: row.title,
    className: row.class_name,
    shift: row.shift,
    subject: row.subject,
    questionCount: row.question_count,
    choiceCount: row.choice_count,
    officialAnswers: JSON.parse(row.official_answers),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function sanitizeSubmission(row) {
  return {
    id: row.id,
    examId: row.exam_id,
    studentName: row.student_name,
    className: row.class_name,
    shift: row.shift,
    subject: row.subject,
    studentAnswers: JSON.parse(row.student_answers),
    score: row.score,
    totalQuestions: row.total_questions,
    createdAt: row.created_at
  };
}

app.post("/api/auth/register", async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    res.status(400).json({ error: "Preencha nome, email e senha." });
    return;
  }

  try {
    const existing = await get("SELECT id FROM users WHERE email = ?", [email.trim().toLowerCase()]);
    if (existing) {
      res.status(409).json({ error: "Este email ja esta cadastrado." });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await run(
      "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
      [name.trim(), email.trim().toLowerCase(), passwordHash]
    );

    const user = { id: result.lastID, name: name.trim(), email: email.trim().toLowerCase() };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: "7d" });
    res.status(201).json({ token, user });
  } catch (error) {
    res.status(500).json({ error: "Nao foi possivel criar a conta." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    res.status(400).json({ error: "Informe email e senha." });
    return;
  }

  try {
    const userRow = await get("SELECT * FROM users WHERE email = ?", [email.trim().toLowerCase()]);
    if (!userRow) {
      res.status(401).json({ error: "Credenciais invalidas." });
      return;
    }

    const ok = await bcrypt.compare(password, userRow.password_hash);
    if (!ok) {
      res.status(401).json({ error: "Credenciais invalidas." });
      return;
    }

    const user = { id: userRow.id, name: userRow.name, email: userRow.email };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user });
  } catch (error) {
    res.status(500).json({ error: "Nao foi possivel entrar." });
  }
});

app.get("/api/me", authRequired, async (req, res) => {
  res.json({ user: req.user });
});

app.get("/api/exams", authRequired, async (req, res) => {
  try {
    const rows = await all(
      "SELECT * FROM exams WHERE user_id = ? ORDER BY datetime(updated_at) DESC, id DESC",
      [req.user.id]
    );
    res.json({ exams: rows.map(sanitizeExam) });
  } catch (error) {
    res.status(500).json({ error: "Nao foi possivel listar os gabaritos." });
  }
});

app.get("/api/exams/:id", authRequired, async (req, res) => {
  try {
    const row = await get("SELECT * FROM exams WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);
    if (!row) {
      res.status(404).json({ error: "Gabarito nao encontrado." });
      return;
    }
    res.json({ exam: sanitizeExam(row) });
  } catch (error) {
    res.status(500).json({ error: "Nao foi possivel carregar o gabarito." });
  }
});

app.post("/api/exams", authRequired, async (req, res) => {
  const {
    title,
    className,
    shift,
    subject,
    questionCount,
    choiceCount,
    officialAnswers
  } = req.body || {};

  if (!title || !className || !shift || !subject || !questionCount || !choiceCount || !Array.isArray(officialAnswers)) {
    res.status(400).json({ error: "Preencha todos os campos da prova." });
    return;
  }

  try {
    const result = await run(
      `INSERT INTO exams (
        user_id, title, class_name, shift, subject, question_count, choice_count, official_answers
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        title.trim(),
        className.trim(),
        shift.trim(),
        subject.trim(),
        Number(questionCount),
        Number(choiceCount),
        JSON.stringify(officialAnswers)
      ]
    );

    const row = await get("SELECT * FROM exams WHERE id = ?", [result.lastID]);
    res.status(201).json({ exam: sanitizeExam(row) });
  } catch (error) {
    res.status(500).json({ error: "Nao foi possivel salvar o gabarito." });
  }
});

app.put("/api/exams/:id", authRequired, async (req, res) => {
  const {
    title,
    className,
    shift,
    subject,
    questionCount,
    choiceCount,
    officialAnswers
  } = req.body || {};

  if (!title || !className || !shift || !subject || !questionCount || !choiceCount || !Array.isArray(officialAnswers)) {
    res.status(400).json({ error: "Preencha todos os campos da prova." });
    return;
  }

  try {
    const existing = await get("SELECT id FROM exams WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);
    if (!existing) {
      res.status(404).json({ error: "Gabarito nao encontrado." });
      return;
    }

    await run(
      `UPDATE exams
       SET title = ?, class_name = ?, shift = ?, subject = ?, question_count = ?, choice_count = ?,
           official_answers = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
      [
        title.trim(),
        className.trim(),
        shift.trim(),
        subject.trim(),
        Number(questionCount),
        Number(choiceCount),
        JSON.stringify(officialAnswers),
        req.params.id,
        req.user.id
      ]
    );

    const row = await get("SELECT * FROM exams WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);
    res.json({ exam: sanitizeExam(row) });
  } catch (error) {
    res.status(500).json({ error: "Nao foi possivel atualizar o gabarito." });
  }
});

app.get("/api/submissions", authRequired, async (req, res) => {
  try {
    const params = [req.user.id];
    let query = "SELECT * FROM submissions WHERE user_id = ?";
    if (req.query.examId) {
      query += " AND exam_id = ?";
      params.push(req.query.examId);
    }
    query += " ORDER BY datetime(created_at) DESC, id DESC";

    const rows = await all(query, params);
    res.json({ submissions: rows.map(sanitizeSubmission) });
  } catch (error) {
    res.status(500).json({ error: "Nao foi possivel listar as correcoes." });
  }
});

app.post("/api/submissions", authRequired, async (req, res) => {
  const {
    examId,
    studentName,
    className,
    shift,
    subject,
    studentAnswers,
    score,
    totalQuestions
  } = req.body || {};

  if (!examId || !studentName || !className || !shift || !subject || !Array.isArray(studentAnswers)) {
    res.status(400).json({ error: "Preencha os dados do aluno e da correcao." });
    return;
  }

  try {
    const exam = await get("SELECT id FROM exams WHERE id = ? AND user_id = ?", [examId, req.user.id]);
    if (!exam) {
      res.status(404).json({ error: "Gabarito vinculado nao encontrado." });
      return;
    }

    const result = await run(
      `INSERT INTO submissions (
        exam_id, user_id, student_name, class_name, shift, subject, student_answers, score, total_questions
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(examId),
        req.user.id,
        studentName.trim(),
        className.trim(),
        shift.trim(),
        subject.trim(),
        JSON.stringify(studentAnswers),
        Number(score) || 0,
        Number(totalQuestions) || studentAnswers.length
      ]
    );

    const row = await get("SELECT * FROM submissions WHERE id = ?", [result.lastID]);
    res.status(201).json({ submission: sanitizeSubmission(row) });
  } catch (error) {
    res.status(500).json({ error: "Nao foi possivel salvar a correcao." });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/app.js", (req, res) => {
  res.sendFile(path.join(__dirname, "app.js"));
});

app.get("/styles.css", (req, res) => {
  res.sendFile(path.join(__dirname, "styles.css"));
});

app.get("*", (req, res) => {
  res.redirect("/");
});

app.listen(PORT, () => {
  console.log(`Gerador de Gabarito online em http://localhost:${PORT}`);
});
