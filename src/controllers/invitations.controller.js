import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { v4 as uuid } from 'uuid'

import { pool } from '../config/db.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { toPublicUser } from './users.controller.js'
import { signAccessToken, signRefreshToken } from '../utils/jwt.js'

const SENDLIB_API_URL = 'https://sendlib.samueltuoyo.com/api/send'

const SENDLIB_API_KEY = process.env.SENDLIB_API_KEY

const FROM_EMAIL =
  process.env.SENDLIB_FROM_EMAIL ||
  'Franciscourbron02@gmail.com'

const FROM_NAME =
  process.env.SENDLIB_FROM_NAME ||
  'Francis Courbron | FitSphere Plus'

const CLIENT_ORIGIN =
  process.env.CLIENT_ORIGIN ||
  'https://fitsphere-plus.vercel.app'

function toMySQLDateTime(value) {
  if (!value) return null

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  const pad = (number) => String(number).padStart(2, '0')

  return (
    date.getUTCFullYear() +
    '-' +
    pad(date.getUTCMonth() + 1) +
    '-' +
    pad(date.getUTCDate()) +
    ' ' +
    pad(date.getUTCHours()) +
    ':' +
    pad(date.getUTCMinutes()) +
    ':' +
    pad(date.getUTCSeconds())
  )
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function buildInvitationEmail({
  signupLink,
  email,
  firstName,
  lastName,
  subscriptionEnd,
}) {
  const safeEmail = escapeHtml(email)
  const safeFirstName = escapeHtml(firstName || '')
  const safeLastName = escapeHtml(lastName || '')

  const clientName =
    [safeFirstName, safeLastName]
      .filter(Boolean)
      .join(' ') || 'cher client'

  const textFirstName =
    firstName?.trim() || 'cher client'

  const dateText = subscriptionEnd
    ? new Date(subscriptionEnd).toLocaleDateString('fr-FR')
    : null

  return `
<!DOCTYPE html>
<html lang="fr">

<head>
  <meta charset="UTF-8">
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >
  <title>Votre espace FitSphere Plus</title>
</head>

<body
  style="
    margin:0;
    padding:0;
    background:#111315;
    font-family:Arial,Helvetica,sans-serif;
    color:#ffffff;
  "
>

<table
  width="100%"
  cellpadding="0"
  cellspacing="0"
  border="0"
  style="
    background:#111315;
    padding:30px 15px;
  "
>
<tr>
<td align="center">

<table
  width="600"
  cellpadding="0"
  cellspacing="0"
  border="0"
  style="
    max-width:600px;
    width:100%;
    background:#1b1e21;
    border-radius:18px;
    overflow:hidden;
  "
>

<!-- HEADER -->

<tr>
<td
  style="
    padding:28px 30px;
    background:#17191b;
    border-bottom:1px solid #30343a;
  "
>

<div
  style="
    font-size:25px;
    font-weight:800;
    letter-spacing:1px;
    color:#ffffff;
  "
>
  FITSPHERE
  <span style="color:#ff6b22;">PLUS</span>
</div>

<div
  style="
    margin-top:7px;
    color:#9da4ad;
    font-size:12px;
    letter-spacing:2px;
  "
>
  FRANCIS COURBRON · COACHING SPORTIF
</div>

</td>
</tr>

<!-- HERO -->

<tr>
<td>

<div
  style="
    height:190px;
    background:linear-gradient(
      135deg,
      #24282d 0%,
      #17191b 55%,
      #ff6b22 160%
    );
  "
>

<div
  style="
    padding:45px 35px;
    font-size:34px;
    line-height:1.1;
    font-weight:800;
    color:#ffffff;
  "
>
  TON COACHING.<br>
  TON ESPACE.<br>
  <span style="color:#ff6b22;">
    TES OBJECTIFS.
  </span>
</div>

</div>

</td>
</tr>

<!-- CONTENT -->

<tr>
<td
  style="
    padding:38px 35px 30px;
  "
>

<div
  style="
    font-size:26px;
    font-weight:800;
    margin-bottom:18px;
  "
>
  Bonjour ${clientName} 👋
</div>

<p
  style="
    margin:0 0 18px;
    color:#d8dce1;
    font-size:16px;
    line-height:1.7;
  "
>
  Votre coach
  <strong style="color:#ffffff;">
    Francis Courbron
  </strong>
  vous invite à rejoindre votre espace personnel de coaching sur
  <strong style="color:#ff6b22;">
    FitSphere Plus
  </strong>.
</p>

<p
  style="
    margin:0 0 26px;
    color:#d8dce1;
    font-size:16px;
    line-height:1.7;
  "
>
  Créez votre compte pour accéder à votre espace personnel,
  retrouver vos informations et commencer votre accompagnement.
</p>

<!-- BUTTON -->

<table
  cellpadding="0"
  cellspacing="0"
  border="0"
  width="100%"
>
<tr>
<td align="center">

<a
  href="${signupLink}"
  style="
    display:inline-block;
    background:#ff6b22;
    color:#ffffff;
    text-decoration:none;
    font-size:16px;
    font-weight:800;
    padding:16px 30px;
    border-radius:10px;
    letter-spacing:.5px;
  "
>
  CRÉER MON ESPACE
</a>

</td>
</tr>
</table>

<!-- INFORMATION -->

<div
  style="
    margin-top:30px;
    padding:18px;
    background:#24282d;
    border-radius:10px;
    color:#aeb5bd;
    font-size:13px;
    line-height:1.7;
  "
>

<strong style="color:#ffffff;">
  Adresse associée :
</strong>

${safeEmail}

<br>

<strong style="color:#ffffff;">
  Validité du lien :
</strong>

72 heures

${
  dateText
    ? `
<br>

<strong style="color:#ffffff;">
  Fin de l'accès :
</strong>

${escapeHtml(dateText)}
`
    : ''
}

</div>

<p
  style="
    margin:28px 0 0;
    color:#8e969f;
    font-size:13px;
    line-height:1.6;
  "
>
  Si vous n'êtes pas à l'origine de cette invitation,
  vous pouvez simplement ignorer cet e-mail.
</p>

</td>
</tr>

<!-- FOOTER -->

<tr>
<td
  style="
    padding:25px 35px;
    background:#151719;
    border-top:1px solid #30343a;
    text-align:center;
  "
>

<div
  style="
    color:#ffffff;
    font-weight:700;
    font-size:14px;
  "
>
  Francis Courbron
</div>

<div
  style="
    margin-top:6px;
    color:#777f88;
    font-size:12px;
  "
>
  Coaching sportif · FitSphere Plus
</div>

</td>
</tr>

</table>

</td>
</tr>
</table>

</body>
</html>
`
}

async function sendInvitationEmail({
  email,
  firstName,
  lastName,
  signupLink,
  subscriptionEnd,
}) {
  if (!SENDLIB_API_KEY) {
    throw new ApiError(
      500,
      "La clé API Sendlib n'est pas configurée",
    )
  }

  const html = buildInvitationEmail({
    signupLink,
    email,
    firstName,
    lastName,
    subscriptionEnd,
  })

  const text = [
    `Bonjour ${firstName?.trim() || 'cher client'},`,
    '',
    'Votre coach Francis Courbron vous invite à rejoindre votre espace FitSphere Plus.',
    '',
    `Créez votre espace ici : ${signupLink}`,
    '',
    'Ce lien est valable pendant 72 heures.',
    '',
    'À bientôt,',
    'Francis Courbron',
  ].join('\n')

  const response = await fetch(SENDLIB_API_URL, {
    method: 'POST',

    headers: {
      Authorization: `Bearer ${SENDLIB_API_KEY}`,
      'Content-Type': 'application/json',
    },

    body: JSON.stringify({
      from: `"${FROM_NAME}" <${FROM_EMAIL}>`,

      to: email,

      subject:
        'Votre accès à votre espace FitSphere Plus',

      html,

      text,
    }),
  })

  const responseText = await response.text()

  let responseData = null

  try {
    responseData = responseText
      ? JSON.parse(responseText)
      : null
  } catch {
    responseData = responseText
  }

  if (!response.ok) {
    console.error(
      '[Sendlib] Erreur envoi:',
      response.status,
      responseData,
    )

    throw new ApiError(
      502,
      "Impossible d'envoyer l'invitation par e-mail",
    )
  }

  return responseData
}

export const create = asyncHandler(async (req, res) => {
  const {
    email,
    firstName,
    lastName,
    subscriptionEnd,
  } = req.body

  if (!email) {
    throw new ApiError(400, 'Email requis')
  }

  if (!firstName) {
    throw new ApiError(400, 'Prénom requis')
  }

  if (!lastName) {
    throw new ApiError(400, 'Nom requis')
  }

  const [existing] = await pool.query(
    'SELECT id FROM users WHERE email = ?',
    [email],
  )

  if (existing.length) {
    throw new ApiError(
      409,
      'Un compte existe déjà avec cet email',
    )
  }

  const id = uuid()

  const token =
    crypto.randomBytes(24).toString('hex')

  const mysqlSubscriptionEnd =
    toMySQLDateTime(subscriptionEnd)

  await pool.query(
    `INSERT INTO invitations
      (
        id,
        token,
        email,
        subscription_end,
        expires_at
      )
     VALUES
      (
        ?,
        ?,
        ?,
        ?,
        DATE_ADD(NOW(), INTERVAL 72 HOUR)
      )`,
    [
      id,
      token,
      email,
      mysqlSubscriptionEnd,
    ],
  )

  const signupLink =
    `${CLIENT_ORIGIN}/inscription/${token}`

  await sendInvitationEmail({
    email,
    firstName,
    lastName,
    signupLink,
    subscriptionEnd,
  })

  res.status(201).json({
    token,
    email,
    firstName,
    lastName,
    subscriptionEnd: mysqlSubscriptionEnd,
  })
})

export const check = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT * FROM invitations WHERE token = ?',
    [req.params.token],
  )

  const inv = rows[0]

  if (
    !inv ||
    inv.used ||
    new Date(inv.expires_at) < new Date()
  ) {
    throw new ApiError(
      410,
      "Ce lien d'invitation est invalide ou expiré",
    )
  }

  res.json({
    email: inv.email,
  })
})

export const accept = asyncHandler(async (req, res) => {
  const {
    firstName,
    lastName,
    password,
  } = req.body

  if (!firstName || !lastName || !password) {
    throw new ApiError(
      400,
      'Prénom, nom et mot de passe requis',
    )
  }

  const [rows] = await pool.query(
    'SELECT * FROM invitations WHERE token = ?',
    [req.params.token],
  )

  const inv = rows[0]

  if (
    !inv ||
    inv.used ||
    new Date(inv.expires_at) < new Date()
  ) {
    throw new ApiError(
      410,
      "Ce lien d'invitation est invalide ou expiré",
    )
  }

  const [existing] = await pool.query(
    'SELECT id FROM users WHERE email = ?',
    [inv.email],
  )

  if (existing.length) {
    throw new ApiError(
      409,
      'Un compte existe déjà avec cet email',
    )
  }

  const userId = uuid()

  const passwordHash = await bcrypt.hash(
    password,
    10,
  )

  const palette = [
    '#3d7fff',
    '#c6ff3d',
    '#ff4423',
    '#8b96a5',
    '#ff8a3d',
  ]

  const avatarColor =
    palette[
      Math.floor(Math.random() * palette.length)
    ]

  const mysqlSubscriptionEnd =
    toMySQLDateTime(inv.subscription_end)

  await pool.query(
    `INSERT INTO users
      (
        id,
        first_name,
        last_name,
        email,
        password_hash,
        role,
        status,
        avatar_color,
        subscription_end
      )
     VALUES
      (
        ?,
        ?,
        ?,
        ?,
        ?,
        'client',
        'active',
        ?,
        ?
      )`,
    [
      userId,
      firstName,
      lastName,
      inv.email,
      passwordHash,
      avatarColor,
      mysqlSubscriptionEnd,
    ],
  )

  await pool.query(
    'UPDATE invitations SET used = 1 WHERE id = ?',
    [inv.id],
  )

  const [[user]] = await pool.query(
    'SELECT * FROM users WHERE id = ?',
    [userId],
  )

  const accessToken =
    signAccessToken(user)

  const refreshToken =
    signRefreshToken(user)

  const refreshHash =
    await bcrypt.hash(refreshToken, 8)

  await pool.query(
    `INSERT INTO refresh_tokens
      (
        id,
        user_id,
        token_hash,
        expires_at
      )
     VALUES
      (
        ?,
        ?,
        ?,
        DATE_ADD(NOW(), INTERVAL 30 DAY)
      )`,
    [
      uuid(),
      userId,
      refreshHash,
    ],
  )

  res.cookie('cf_refresh', refreshToken, {
    httpOnly: true,
    secure:
      process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:
      30 * 24 * 60 * 60 * 1000,
    path: '/auth',
  })

  res.status(201).json({
    accessToken,
    user: toPublicUser(user),
  })
})