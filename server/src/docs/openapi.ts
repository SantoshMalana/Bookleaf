import { CATEGORIES, PRIORITIES, STATUSES } from '../config/constants.js';

/**
 * OpenAPI 3.0 description of the REST API, served as Swagger UI at /api/docs and as JSON at
 * /api/openapi.json. Hand-maintained next to the routes; test/openapi.test.ts fails if a real
 * route is missing from this document.
 */
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: unknown) => ({ 'application/json': { schema } });
const body = (schema: unknown, required = true) => ({ required, content: json(schema) });
const resp = (description: string, schema?: unknown) => ({ description, ...(schema ? { content: json(schema) } : {}) });
const data = (schema: unknown) => ({ type: 'object', properties: { data: schema } });
const err = (name: string) => ({ $ref: `#/components/responses/${name}` });
const idParam = (name: string, description: string) => ({ name, in: 'path', required: true, description, schema: { type: 'string', pattern: '^[a-f0-9]{24}$' } });

const AUTHED = [{ bearerAuth: [] }, { cookieAuth: [] }];
const common = { '401': err('Unauthenticated'), '429': err('RateLimited') };
const admin = { ...common, '403': err('Forbidden') };

const ticketFilters = [
  { name: 'status', in: 'query', description: 'Comma-separated: ' + STATUSES.join(', '), schema: { type: 'string' } },
  { name: 'category', in: 'query', description: 'Comma-separated categories', schema: { type: 'string' } },
  { name: 'priority', in: 'query', description: 'Comma-separated: ' + PRIORITIES.join(', '), schema: { type: 'string' } },
  { name: 'from', in: 'query', description: 'Created on/after (YYYY-MM-DD)', schema: { type: 'string', format: 'date' } },
  { name: 'to', in: 'query', description: 'Created on/before (YYYY-MM-DD)', schema: { type: 'string', format: 'date' } },
  { name: 'assignee', in: 'query', description: '`me`, `unassigned`, or an admin user id (admin only)', schema: { type: 'string' } },
  { name: 'overdue', in: 'query', description: 'Only tickets past their response SLA', schema: { type: 'boolean' } },
  { name: 'q', in: 'query', description: 'Search subject/description, or a ticket number like BL-1004', schema: { type: 'string' } },
  { name: 'sort', in: 'query', description: '`urgency` (default for admins: active, highest priority, oldest first), `newest`, `oldest`, `activity` (default for authors)', schema: { type: 'string', enum: ['urgency', 'newest', 'oldest', 'activity'] } },
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
];

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'BookLeaf Author Support & Communication Portal API',
    version: '1.0.0',
    description:
      'REST API behind the author and admin portals.\n\n**Auth:** `POST /auth/login` sets an httpOnly session cookie and also returns a JWT; send it as `Authorization: Bearer <token>` from Swagger/Postman (use the Authorize button).\n\n**Roles:** `author` sees only their own books and tickets (another author\'s resources return 404). `admin` can access everything, including all `/admin/*` routes.\n\n**Errors** always use `{ "error": { "code", "message", "details?", "requestId" } }`.',
  },
  servers: [{ url: '/api/v1' }],
  tags: [
    { name: 'Auth' },
    { name: 'Author' },
    { name: 'Tickets (author)' },
    { name: 'Admin' },
    { name: 'Realtime' },
    { name: 'System' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      cookieAuth: { type: 'apiKey', in: 'cookie', name: 'bl_session' },
    },
    responses: {
      Unauthenticated: { description: 'Missing, invalid or expired session', content: json(ref('Error')) },
      Forbidden: { description: 'Authenticated but not allowed (wrong role)', content: json(ref('Error')) },
      NotFound: { description: 'Resource does not exist or belongs to another author', content: json(ref('Error')) },
      ValidationError: { description: 'Request failed validation; `details` lists each field', content: json(ref('Error')) },
      RateLimited: { description: 'Too many requests', content: json(ref('Error')) },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: { code: { type: 'string', example: 'VALIDATION_ERROR' }, message: { type: 'string' }, details: {}, requestId: { type: 'string' } },
            required: ['code', 'message'],
          },
        },
      },
      User: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, email: { type: 'string' }, role: { type: 'string', enum: ['author', 'admin'] }, authorId: { type: 'string', nullable: true } } },
      Book: {
        type: 'object',
        description: 'Null fields (publicationDate, mrp, royaltyPerCopy, printPartner) are expected for books still in production.',
        properties: {
          id: { type: 'string' }, bookCode: { type: 'string' }, title: { type: 'string' }, isbn: { type: 'string' }, genre: { type: 'string' },
          publicationDate: { type: 'string', format: 'date', nullable: true }, status: { type: 'string' }, isLive: { type: 'boolean' },
          mrp: { type: 'number', nullable: true }, royaltyPerCopy: { type: 'number', nullable: true },
          totalCopiesSold: { type: 'integer' }, totalRoyaltyEarned: { type: 'number' }, royaltyPaid: { type: 'number' }, royaltyPending: { type: 'number' },
          lastRoyaltyPayoutDate: { type: 'string', format: 'date', nullable: true }, printPartner: { type: 'string', nullable: true },
          availableOn: { type: 'array', items: { type: 'string' } },
          production: { type: 'object', description: 'Pipeline position derived from status' },
          payout: { type: 'object', description: 'Derived payout state: settled | scheduled | below_threshold | overdue | not_applicable, with next payout date' },
        },
      },
      Message: {
        type: 'object',
        properties: {
          id: { type: 'string' }, kind: { type: 'string', enum: ['public', 'internal', 'event'], description: 'Authors only ever receive `public`' },
          senderRole: { type: 'string', enum: ['author', 'admin', 'system'] }, senderName: { type: 'string' }, body: { type: 'string' }, createdAt: { type: 'string', format: 'date-time' },
        },
      },
      AuthorTicket: {
        type: 'object',
        properties: {
          id: { type: 'string' }, ticketId: { type: 'string', example: 'BL-1004' }, number: { type: 'integer' }, subject: { type: 'string' }, description: { type: 'string' },
          status: { type: 'string', enum: [...STATUSES] }, book: { type: 'object', nullable: true }, attachments: { type: 'array', items: { type: 'object' } },
          createdAt: { type: 'string', format: 'date-time' }, lastActivityAt: { type: 'string', format: 'date-time' }, replyCount: { type: 'integer' },
          feedback: { type: 'object', nullable: true, description: 'The author\'s rating of the resolution', properties: { helpful: { type: 'boolean' }, comment: { type: 'string', nullable: true }, at: { type: 'string', format: 'date-time' } } },
          messages: { type: 'array', items: ref('Message') },
        },
      },
      AdminTicket: {
        type: 'object',
        description: 'Adds AI classification, priority, SLA, assignee, internal messages and the cached draft.',
        properties: {
          id: { type: 'string' }, ticketId: { type: 'string' }, subject: { type: 'string' }, status: { type: 'string', enum: [...STATUSES] },
          category: { type: 'string', enum: [...CATEGORIES], nullable: true }, categorySource: { type: 'string', enum: ['pending', 'ai', 'fallback', 'admin', 'seed'] },
          priority: { type: 'string', enum: [...PRIORITIES] }, prioritySource: { type: 'string', enum: ['pending', 'ai', 'fallback', 'admin', 'seed'] }, priorityReason: { type: 'string', nullable: true },
          triage: { type: 'object', description: 'AI triage outcome: status (pending|done|fallback), model, confidence, rationale, error' },
          author: { type: 'object' }, assignedTo: { type: 'object', nullable: true }, isOverdue: { type: 'boolean' }, slaDueAt: { type: 'string', format: 'date-time', nullable: true },
          messages: { type: 'array', items: ref('Message') }, draft: { allOf: [ref('Draft')], nullable: true },
        },
      },
      Draft: {
        type: 'object',
        properties: {
          body: { type: 'string', description: 'Reply text including the requesting admin\'s signature' },
          source: { type: 'string', enum: ['ai', 'template'], description: '`template` means the AI was unavailable and a policy template was used' },
          verifyBeforeSending: { type: 'array', items: { type: 'string' }, description: 'Facts the reviewer must confirm' },
          needsEscalation: { type: 'boolean' }, escalationTeam: { type: 'string' }, model: { type: 'string', nullable: true }, cached: { type: 'boolean' }, generatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Pagination: { type: 'object', properties: { page: { type: 'integer' }, limit: { type: 'integer' }, total: { type: 'integer' }, totalPages: { type: 'integer' } } },
    },
  },
  paths: {
    '/health': {
      get: { tags: ['System'], summary: 'Liveness + dependency status (no secrets exposed)', security: [], responses: { '200': resp('OK') } },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'], summary: 'Sign in with email + password', security: [],
        requestBody: body({ type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } } }),
        responses: { '200': resp('Signed in; session cookie set, JWT returned', data({ type: 'object', properties: { user: ref('User'), token: { type: 'string' } } })), '400': err('ValidationError'), '401': resp('Incorrect email or password', ref('Error')), '429': err('RateLimited') },
      },
    },
    '/auth/logout': { post: { tags: ['Auth'], summary: 'Clear the session cookie', security: [], responses: { '204': resp('Signed out') } } },
    '/auth/me': { get: { tags: ['Auth'], summary: 'Current user', security: AUTHED, responses: { '200': resp('OK', data(ref('User'))), ...common } } },
    '/auth/demo-accounts': { get: { tags: ['Auth'], summary: 'Seeded demo logins (only when DEMO_MODE=true; 404 otherwise)', security: [], responses: { '200': resp('OK'), '404': err('NotFound') } } },
    '/me': { get: { tags: ['Author'], summary: 'Profile and dashboard summary (royalty totals, next payout date, ticket counts)', security: AUTHED, responses: { '200': resp('OK'), ...common } } },
    '/books': {
      get: {
        tags: ['Author'], summary: 'My books (author) / all books (admin)', security: AUTHED,
        parameters: [{ name: 'authorId', in: 'query', description: 'Admin only: filter by author', schema: { type: 'string' } }],
        responses: { '200': resp('OK', data({ type: 'array', items: ref('Book') })), '400': err('ValidationError'), ...common },
      },
    },
    '/books/{bookId}': {
      get: { tags: ['Author'], summary: 'One book with derived production stage and payout state', security: AUTHED, parameters: [idParam('bookId', 'Book id')], responses: { '200': resp('OK', data(ref('Book'))), '404': err('NotFound'), ...common } },
    },
    '/tickets': {
      get: { tags: ['Tickets (author)'], summary: 'My tickets (author) — admins receive the admin representation of all tickets', security: AUTHED, parameters: ticketFilters, responses: { '200': resp('OK', { type: 'object', properties: { items: { type: 'array', items: ref('AuthorTicket') }, meta: ref('Pagination') } }), '400': err('ValidationError'), ...common } },
      post: {
        tags: ['Tickets (author)'], summary: 'Raise a support ticket (author only). Returns immediately; AI triage runs asynchronously. Idempotent: an identical submission (same book, subject and text) from the same author within 2 minutes returns the existing ticket with 200 instead of creating a duplicate.', security: AUTHED,
        requestBody: body({
          type: 'object', required: ['subject', 'description'],
          properties: { bookId: { type: 'string', nullable: true, description: 'Omit/null for General / Account Level' }, subject: { type: 'string', maxLength: 150 }, description: { type: 'string', minLength: 10, maxLength: 4000 }, attachments: { type: 'array', maxItems: 5, items: { type: 'object', properties: { name: { type: 'string' }, size: { type: 'integer' }, type: { type: 'string' } } }, description: 'UI-only: metadata is stored, files are not' } },
        }),
        responses: { '201': resp('Created', data(ref('AuthorTicket'))), '200': resp('Duplicate submission — the existing ticket', data(ref('AuthorTicket'))), '400': err('ValidationError'), '404': err('NotFound'), ...admin },
      },
    },
    '/tickets/{ticketId}': {
      get: { tags: ['Tickets (author)'], summary: 'One ticket with its public conversation (404 if it belongs to another author)', security: AUTHED, parameters: [idParam('ticketId', 'Ticket id')], responses: { '200': resp('OK', data(ref('AuthorTicket'))), '404': err('NotFound'), ...common } },
    },
    '/tickets/{ticketId}/messages': {
      post: {
        tags: ['Tickets (author)'], summary: 'Author follow-up on their own ticket (reopens a Resolved ticket; Closed tickets return 409)', security: AUTHED,
        parameters: [idParam('ticketId', 'Ticket id')], requestBody: body({ type: 'object', required: ['body'], properties: { body: { type: 'string', maxLength: 4000 } } }),
        responses: { '201': resp('Created', data(ref('AuthorTicket'))), '400': err('ValidationError'), '404': err('NotFound'), '409': resp('Ticket is closed', ref('Error')), ...admin },
      },
    },
    '/tickets/{ticketId}/feedback': {
      post: {
        tags: ['Tickets (author)'], summary: 'Rate a resolution ("Was this helpful?"). Own tickets only, and only once Resolved or Closed (otherwise 409). Re-rating replaces the earlier rating.', security: AUTHED,
        parameters: [idParam('ticketId', 'Ticket id')], requestBody: body({ type: 'object', required: ['helpful'], properties: { helpful: { type: 'boolean' }, comment: { type: 'string', maxLength: 500 } } }),
        responses: { '201': resp('Created', data(ref('AuthorTicket'))), '400': err('ValidationError'), '404': err('NotFound'), '409': resp('Ticket not resolved yet', ref('Error')), ...admin },
      },
    },
    '/events': {
      get: { tags: ['Realtime'], summary: 'Server-Sent Events stream: `ticket` events {type, ticketId, ticketNumber}. Authors only receive events for their own tickets.', security: AUTHED, responses: { '200': { description: 'text/event-stream', content: { 'text/event-stream': { schema: { type: 'string' } } } }, '401': err('Unauthenticated') } },
    },
    '/admin/stats': { get: { tags: ['Admin'], summary: 'Queue statistics (active, overdue, unassigned, by priority…)', security: AUTHED, responses: { '200': resp('OK'), ...admin } } },
    '/admin/ai/usage': { get: { tags: ['Admin'], summary: 'AI usage: calls, tokens, cost estimate, fallback rate, draft acceptance (last 30 days)', security: AUTHED, responses: { '200': resp('OK'), ...admin } } },
    '/admin/tickets': { get: { tags: ['Admin'], summary: 'Ticket queue across all authors with filters, search, sorting and pagination', security: AUTHED, parameters: ticketFilters, responses: { '200': resp('OK', { type: 'object', properties: { items: { type: 'array', items: ref('AdminTicket') }, meta: ref('Pagination') } }), '400': err('ValidationError'), ...admin } } },
    '/admin/tickets/{ticketId}': {
      get: { tags: ['Admin'], summary: 'Full ticket: AI triage, internal notes, activity log and cached draft', security: AUTHED, parameters: [idParam('ticketId', 'Ticket id')], responses: { '200': resp('OK', data(ref('AdminTicket'))), '404': err('NotFound'), ...admin } },
      patch: {
        tags: ['Admin'], summary: 'Update status and/or override AI category / priority (overrides are never overwritten by later AI runs)', security: AUTHED, parameters: [idParam('ticketId', 'Ticket id')],
        requestBody: body({ type: 'object', properties: { status: { type: 'string', enum: [...STATUSES] }, category: { type: 'string', enum: [...CATEGORIES] }, priority: { type: 'string', enum: [...PRIORITIES] } } }),
        responses: { '200': resp('OK', data(ref('AdminTicket'))), '400': err('ValidationError'), '404': err('NotFound'), ...admin },
      },
    },
    '/admin/tickets/{ticketId}/replies': {
      post: {
        tags: ['Admin'], summary: 'Send a reply to the author (visible on their ticket immediately)', security: AUTHED, parameters: [idParam('ticketId', 'Ticket id')],
        requestBody: body({ type: 'object', required: ['body'], properties: { body: { type: 'string' }, status: { type: 'string', enum: ['In Progress', 'Resolved'] }, usedDraft: { type: 'boolean', description: 'Editor was pre-filled from the AI/template draft' } } }),
        responses: { '201': resp('Created', data(ref('AdminTicket'))), '400': err('ValidationError'), '404': err('NotFound'), '409': resp('Ticket is closed', ref('Error')), ...admin },
      },
    },
    '/admin/tickets/{ticketId}/notes': {
      post: { tags: ['Admin'], summary: 'Add an internal note (never visible to the author)', security: AUTHED, parameters: [idParam('ticketId', 'Ticket id')], requestBody: body({ type: 'object', required: ['body'], properties: { body: { type: 'string', maxLength: 2000 } } }), responses: { '201': resp('Created', data(ref('AdminTicket'))), '400': err('ValidationError'), '404': err('NotFound'), ...admin } },
    },
    '/admin/tickets/{ticketId}/assignee': {
      put: { tags: ['Admin'], summary: 'Assign the ticket to yourself, or unassign', security: AUTHED, parameters: [idParam('ticketId', 'Ticket id')], requestBody: body({ type: 'object', required: ['assignee'], properties: { assignee: { type: 'string', enum: ['me', 'unassigned'] } } }), responses: { '200': resp('OK', data(ref('AdminTicket'))), '400': err('ValidationError'), '404': err('NotFound'), ...admin } },
    },
    '/admin/tickets/{ticketId}/draft': {
      post: {
        tags: ['Admin'], summary: 'Get the AI-drafted reply (cached unless `force`). Falls back to a policy template if the AI is unavailable — never fails because of the AI.', security: AUTHED, parameters: [idParam('ticketId', 'Ticket id')],
        requestBody: body({ type: 'object', properties: { force: { type: 'boolean', default: false } } }, false),
        responses: { '200': resp('OK', data(ref('Draft'))), '404': err('NotFound'), ...admin },
      },
    },
    '/admin/tickets/{ticketId}/triage': {
      post: { tags: ['Admin'], summary: 'Re-run AI classification + priority (skips fields an admin has set manually)', security: AUTHED, parameters: [idParam('ticketId', 'Ticket id')], responses: { '200': resp('OK', data(ref('AdminTicket'))), '404': err('NotFound'), ...admin } },
    },
  },
} as const;
