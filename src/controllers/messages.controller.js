import { v4 as uuid } from 'uuid'
import { pool } from '../config/db.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { notifyUser, notifyAdmins } from '../utils/notify.js'

async function getOrCreateConversation(clientId) {
  const [rows] = await pool.query('SELECT * FROM conversations WHERE client_id = ?', [clientId])
  if (rows[0]) return rows[0]
  const id = uuid()
  await pool.query('INSERT INTO conversations (id, client_id) VALUES (?, ?)', [id, clientId])
  const [created] = await pool.query('SELECT * FROM conversations WHERE id = ?', [id])
  return created[0]
}

async function loadConversationWithMessages(conv) {
  const [messages] = await pool.query('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at', [conv.id])
  const [[client]] = await pool.query('SELECT first_name, last_name FROM users WHERE id = ?', [conv.client_id])
  return {
    id: conv.id,
    clientId: conv.client_id,
    clientName: client ? `${client.first_name} ${client.last_name}` : 'Client',
    updatedAt: conv.updated_at,
    messages: messages.map((m) => ({
      id: m.id,
      conversationId: m.conversation_id,
      senderId: m.sender_id,
      senderRole: m.sender_role,
      content: m.content,
      createdAt: m.created_at,
      isRead: !!m.is_read,
    })),
  }
}

// GET /messages/mine — pour un client : sa conversation
export const myConversation = asyncHandler(async (req, res) => {
  const conv = await getOrCreateConversation(req.user.id)
  res.json(await loadConversationWithMessages(conv))
})

// GET /admin/conversations — pour l'admin : toutes les conversations
export const listConversations = asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM conversations ORDER BY updated_at DESC')
  const result = []
  for (const row of rows) result.push(await loadConversationWithMessages(row))
  res.json(result)
})

// POST /messages  { conversationId?, content }  — conversationId optionnel pour un client (auto-résolu)
export const sendMessage = asyncHandler(async (req, res) => {
  const { content } = req.body
  if (!content?.trim()) throw new ApiError(400, 'Message vide')

  let conv
  if (req.user.role === 'client') {
    conv = await getOrCreateConversation(req.user.id)
  } else {
    if (!req.body.conversationId) throw new ApiError(400, 'conversationId requis')
    const [rows] = await pool.query('SELECT * FROM conversations WHERE id = ?', [req.body.conversationId])
    conv = rows[0]
    if (!conv) throw new ApiError(404, 'Conversation introuvable')
  }

  const messageId = uuid()
  await pool.query(
    'INSERT INTO messages (id, conversation_id, sender_id, sender_role, content) VALUES (?, ?, ?, ?, ?)',
    [messageId, conv.id, req.user.id, req.user.role, content.trim()],
  )
  await pool.query('UPDATE conversations SET updated_at = NOW() WHERE id = ?', [conv.id])

  const notifyUserId = req.user.role === 'client' ? null : conv.client_id
  if (req.user.role === 'client') {
    await notifyAdmins({ type: 'message', title: 'Nouveau message', body: content.slice(0, 80), link: '/admin/messages' })
  } else {
    await notifyUser(notifyUserId, { type: 'message', title: 'Nouveau message', body: content.slice(0, 80), link: '/client/messages' })
  }

  const io = req.app.get('io')
  io?.to(`conversation:${conv.id}`).emit('message:new', { conversationId: conv.id })

  const [[saved]] = await pool.query('SELECT * FROM messages WHERE id = ?', [messageId])
  res.status(201).json({
    id: saved.id,
    conversationId: saved.conversation_id,
    senderId: saved.sender_id,
    senderRole: saved.sender_role,
    content: saved.content,
    createdAt: saved.created_at,
    isRead: !!saved.is_read,
  })
})
