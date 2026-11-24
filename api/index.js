import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const cookieName = "quizora_session";
const freeClasses = ["JSS1", "JSS2", "SS1", "SS2"];
const id = () => crypto.randomUUID();
const db = () => {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url)
    throw new Error(
      "Database is not connected. Install Neon from the Vercel Marketplace and redeploy."
    );
  return neon(url);
};
async function init(sql) {
  await sql`CREATE TABLE IF NOT EXISTS q_users ( id text PRIMARY KEY, name text NOT NULL, name_key text UNIQUE NOT NULL, password_hash text NOT NULL, role text NOT NULL CHECK (role IN ('admin','student')), class_name text, device_id text, blocked boolean DEFAULT false, created_at timestamptz DEFAULT now() )`;
  await sql`CREATE TABLE IF NOT EXISTS q_classes (id text PRIMARY KEY, name text UNIQUE NOT NULL, sort_no int DEFAULT 0)`;
  await sql`CREATE TABLE IF NOT EXISTS q_subjects (id text PRIMARY KEY, class_id text REFERENCES q_classes(id) ON DELETE CASCADE, name text NOT NULL, sort_no int DEFAULT 0, UNIQUE(class_id,name))`;
  await sql`CREATE TABLE IF NOT EXISTS q_topics (id text PRIMARY KEY, class_id text REFERENCES q_classes(id) ON DELETE CASCADE, subject_id text REFERENCES q_subjects(id) ON DELETE CASCADE, name text NOT NULL, sort_no int DEFAULT 0)`;
  await sql`CREATE TABLE IF NOT EXISTS q_content (id text PRIMARY KEY, topic_id text REFERENCES q_topics(id) ON DELETE CASCADE, kind text NOT NULL, body text NOT NULL, position int DEFAULT 0, created_at timestamptz DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS q_diagrams (id text PRIMARY KEY, topic_id text REFERENCES q_topics(id) ON DELETE CASCADE, content_id text, name text, mime text, data_url text, created_at timestamptz DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS q_subscriptions (id text PRIMARY KEY, user_id text REFERENCES q_users(id) ON DELETE CASCADE, class_name text NOT NULL, expires_at timestamptz NOT NULL, UNIQUE(user_id,class_name))`;
  await sql`CREATE TABLE IF NOT EXISTS q_announcements (id text PRIMARY KEY, title text NOT NULL, body text NOT NULL, created_at timestamptz DEFAULT now())`;
  const count = await sql`SELECT count(*)::int AS n FROM q_classes`;
  if (!count[0].n) {
    for (const [i, n] of [
      "JSS1",
      "JSS2",
      "JSS3",
      "SS1",
      "SS2",
      "SS3",
      "WAEC",
      "JAMB",
    ].entries())
      await sql`INSERT INTO q_classes(id,name,sort_no) VALUES(${id()},${n},${i}) ON CONFLICT(name) DO NOTHING`;
  }
}
function sign(payload) {
  const raw = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac(
      "sha256",
      process.env.SESSION_SECRET ||
        process.env.ADMIN_SETUP_KEY ||
        "CHANGE_THIS_SECRET_BEFORE_LAUNCH"
    )
    .update(raw)
    .digest("base64url");
  return raw + "." + sig;
}
function verify(token) {
  if (!token) return null;
  const [raw, sig] = token.split(".");
  const expected = crypto
    .createHmac(
      "sha256",
      process.env.SESSION_SECRET ||
        process.env.ADMIN_SETUP_KEY ||
        "CHANGE_THIS_SECRET_BEFORE_LAUNCH"
    )
    .update(raw || "")
    .digest();
  let got;
  try {
    got = Buffer.from(sig || "", "base64url");
  } catch {
    return null;
  }
  if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected))
    return null;
  try {
    const p = JSON.parse(Buffer.from(raw, "base64url").toString());
    return p.exp > Date.now() ? p : null;
  } catch {
    return null;
  }
}
function cookie(token, maxAge = 60 * 60 * 24 * 30) {
  return `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
function getCookie(req) {
  const raw = req.headers.cookie || "";
  const part = raw
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(cookieName + "="));
  return part ? decodeURIComponent(part.slice(cookieName.length + 1)) : null;
}
async function currentUser(sql, req) {
  const s = verify(getCookie(req));
  if (!s) return null;
  const rows =
    await sql`SELECT id,name,role,class_name,blocked FROM q_users WHERE id=${s.uid}`;
  if (!rows.length || rows[0].blocked) return null;
  return rows[0];
}
async function requireAdmin(sql, req) {
  const u = await currentUser(sql, req);
  if (!u || u.role !== "admin")
    throw new Error("Administrator access required.");
  return u;
}
async function bootstrap(sql, user) {
  const classes = await sql`SELECT * FROM q_classes ORDER BY sort_no,name`;
  const subs = await sql`SELECT * FROM q_subjects ORDER BY sort_no,name`;
  const topics = await sql`SELECT * FROM q_topics ORDER BY sort_no,name`;
  const contents =
    await sql`SELECT * FROM q_content ORDER BY position,created_at`;
  const diagrams =
    await sql`SELECT id,topic_id,content_id,name,mime,data_url FROM q_diagrams ORDER BY created_at`;
  let subscriptions = [];
  if (user.role === "student")
    subscriptions =
      await sql`SELECT class_name,expires_at FROM q_subscriptions WHERE user_id=${user.id} AND expires_at>now()`;
  const unlocked = new Set(subscriptions.map((x) => x.class_name));
  const tree = classes.map((c) => {
    const allowed =
      user.role === "admin" ||
      freeClasses.includes(c.name) ||
      unlocked.has(c.name);
    return {
      id: c.id,
      name: c.name,
      unlocked: allowed,
      subjects: subs
        .filter((s) => s.class_id === c.id)
        .map((s) => ({
          id: s.id,
          name: s.name,
          topics: allowed
            ? topics
                .filter((t) => t.subject_id === s.id)
                .map((t) => ({
                  id: t.id,
                  name: t.name,
                  content: contents.filter((b) => b.topic_id === t.id),
                  diagrams: diagrams.filter((d) => d.topic_id === t.id),
                }))
            : [],
        })),
    };
  });
  const announcements =
    await sql`SELECT id,title,body,created_at FROM q_announcements ORDER BY created_at DESC`;
  const students =
    user.role === "admin"
      ? await sql`SELECT u.id,u.name,u.class_name,u.blocked, (SELECT count(*) FROM q_subscriptions s WHERE s.user_id=u.id AND s.expires_at>now())::int AS active_subscriptions FROM q_users u WHERE role='student' ORDER BY created_at DESC`
      : undefined;
  return { user, tree, announcements, students };
}
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST." });
    return;
  }
  try {
    const body = req.body || {};
    const sql = db();
    await init(sql);
    const a = body.action;
    if (a === "status") {
      const r =
        await sql`SELECT count(*)::int AS n FROM q_users WHERE role='admin'`;
      res.status(200).json({ adminExists: r[0].n > 0 });
      return;
    }
    if (a === "adminSetup") {
      if (!process.env.ADMIN_SETUP_KEY)
        throw new Error(
          "Set ADMIN_SETUP_KEY in Vercel Environment Variables first."
        );
      if (body.setupKey !== process.env.ADMIN_SETUP_KEY)
        throw new Error("Incorrect setup key.");
      const exists =
        await sql`SELECT id FROM q_users WHERE role='admin' LIMIT 1`;
      if (exists.length) throw new Error("An administrator already exists.");
      if (!body.name || !body.password || body.password.length < 10)
        throw new Error(
          "Choose a username and a password of at least 10 characters."
        );
      const uid = id();
      await sql`INSERT INTO q_users(id,name,name_key,password_hash,role) VALUES(${uid},${ body.name },${body.name.toLowerCase()},${await bcrypt.hash( body.password, 12 )},'admin')`;
      res.status(200).json({ name: body.name });
      return;
    }
    if (a === "register") {
      const name = String(body.name || "").trim(),
        password = String(body.password || "");
      if (name.length < 2 || password.length < 6)
        throw new Error(
          "Enter a name and a password of at least 6 characters."
        );
      if (
        !["JSS1", "JSS2", "JSS3", "SS1", "SS2", "SS3", "WAEC", "JAMB"].includes(
          body.className
        )
      )
        throw new Error("Choose a valid class.");
      const uid = id();
      await sql`INSERT INTO q_users(id,name,name_key,password_hash,role,class_name,device_id) VALUES(${uid},${name},${name.toLowerCase()},${await bcrypt.hash( password, 12 )},'student',${body.className},${body.deviceId || null})`;
      res.setHeader(
        "Set-Cookie",
        cookie(sign({ uid, exp: Date.now() + 30 * 86400000 }))
      );
      const user = {
        id: uid,
        name,
        role: "student",
        class_name: body.className,
        blocked: false,
      };
      res.status(201).json({ user });
      return;
    }
    if (a === "login") {
      const rows = await sql`SELECT * FROM q_users WHERE name_key=${String( body.name || "" ) .trim() .toLowerCase()} AND role=${body.role}`;
      if (
        !rows.length ||
        !(await bcrypt.compare(
          String(body.password || ""),
          rows[0].password_hash
        ))
      )
        throw new Error("Incorrect username or password.");
      const u = rows[0];
      if (u.blocked)
        throw new Error(
          "This account has been blocked. Contact the administrator."
        );
      if (
        u.role === "student" &&
        u.device_id &&
        body.deviceId &&
        u.device_id !== body.deviceId
      )
        throw new Error(
          "This student account is registered to another device."
        );
      if (u.role === "student" && !u.device_id)
        await sql`UPDATE q_users SET device_id=${ body.deviceId || null } WHERE id=${u.id}`;
      res.setHeader(
        "Set-Cookie",
        cookie(sign({ uid: u.id, exp: Date.now() + 30 * 86400000 }))
      );
      res
        .status(200)
        .json({
          user: {
            id: u.id,
            name: u.name,
            role: u.role,
            class_name: u.class_name,
            blocked: u.blocked,
          },
        });
      return;
    }
    if (a === "logout") {
      res.setHeader("Set-Cookie", cookie("", 0));
      res.status(200).json({ ok: true });
      return;
    }
    const user = await currentUser(sql, req);
    if (!user)
      throw new Error(
        "Your session has expired. Connect to the internet and sign in again."
      );
    if (a === "bootstrap") {
      res.status(200).json(await bootstrap(sql, user));
      return;
    }
    await requireAdmin(sql, req);
    if (a === "saveClass") {
      if (!body.name?.trim()) throw new Error("Class name is required.");
      await sql`INSERT INTO q_classes(id,name,sort_no) VALUES(${id()},${body.name.trim()},999) ON CONFLICT(name) DO NOTHING`;
    } else if (a === "saveSubject") {
      if (!body.classId || !body.name?.trim())
        throw new Error("Select a class and enter a subject.");
      await sql`INSERT INTO q_subjects(id,class_id,name,sort_no) VALUES(${id()},${ body.classId },${body.name.trim()},999) ON CONFLICT(class_id,name) DO NOTHING`;
    } else if (a === "saveTopic") {
      if (!body.subjectId || !body.name?.trim())
        throw new Error("Select a subject and enter a topic.");
      await sql`INSERT INTO q_topics(id,class_id,subject_id,name,sort_no) VALUES(${id()},${ body.classId },${body.subjectId},${body.name.trim()},999)`;
    } else if (a === "renameItem") {
      if (body.type === "class")
        await sql`UPDATE q_classes SET name=${body.name} WHERE id=${body.id}`;
      else if (body.type === "subject")
        await sql`UPDATE q_subjects SET name=${body.name} WHERE id=${body.id}`;
      else if (body.type === "topic")
        await sql`UPDATE q_topics SET name=${body.name} WHERE id=${body.id}`;
    } else if (a === "deleteItem") {
      if (body.type === "class")
        await sql`DELETE FROM q_classes WHERE id=${body.id}`;
      else if (body.type === "subject")
        await sql`DELETE FROM q_subjects WHERE id=${body.id}`;
      else if (body.type === "topic")
        await sql`DELETE FROM q_topics WHERE id=${body.id}`;
    } else if (a === "saveContent") {
      await sql`INSERT INTO q_content(id,topic_id,kind,body,position) VALUES(${ body.id || id() },${body.topicId},${body.kind === "phrase" ? "phrase" : "note"},${ body.body },${Number(body.position) || 999999})`;
    } else if (a === "updateContent") {
      await sql`UPDATE q_content SET body=${body.body} WHERE id=${body.id}`;
    } else if (a === "deleteContent") {
      await sql`DELETE FROM q_content WHERE id=${body.id}`;
      await sql`DELETE FROM q_diagrams WHERE content_id=${body.id}`;
    } else if (a === "saveDiagram") {
      if (String(body.dataUrl || "").length > 2800000)
        throw new Error("Image is too large. Use an image under 2 MB.");
      await sql`INSERT INTO q_diagrams(id,topic_id,content_id,name,mime,data_url) VALUES(${ body.id || id() },${body.topicId},${body.contentId || null},${body.name || "Diagram"},${ body.mime || "image/png" },${body.dataUrl})`;
    } else if (a === "deleteDiagram") {
      await sql`DELETE FROM q_diagrams WHERE id=${body.id}`;
    } else if (a === "saveAnnouncement") {
      await sql`INSERT INTO q_announcements(id,title,body) VALUES(${id()},${ body.title },${body.body})`;
    } else if (a === "deleteAnnouncement") {
      await sql`DELETE FROM q_announcements WHERE id=${body.id}`;
    } else if (a === "setStudentBlocked") {
      await sql`UPDATE q_users SET blocked=${!!body.blocked} WHERE id=${ body.id } AND role='student'`;
    } else if (a === "resetDevice") {
      await sql`UPDATE q_users SET device_id=NULL WHERE id=${body.id} AND role='student'`;
    } else if (a === "setSubscription") {
      if (!["JSS3", "SS3", "WAEC", "JAMB"].includes(body.className))
        throw new Error("Only premium classes can be unlocked.");
      const days = Math.max(1, Math.min(3660, Number(body.days) || 365));
      await sql`INSERT INTO q_subscriptions(id,user_id,class_name,expires_at) VALUES(${id()},${ body.userId },${ body.className },now()+(${days} * interval '1 day')) ON CONFLICT(user_id,class_name) DO UPDATE SET expires_at=EXCLUDED.expires_at`;
    } else throw new Error("Unknown action.");
    const fresh = await bootstrap(sql, user);
    res.status(200).json({ ok: true, ...(a === "bootstrap" ? fresh : {}) });
  } catch (e) {
    res.status(400).json({ error: e.message || "Something went wrong." });
  }
}
