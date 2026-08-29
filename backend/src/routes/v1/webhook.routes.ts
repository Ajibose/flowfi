/**
 * Webhook subscription management routes (Issue #1189)
 */
import { Router } from "express";
import * as webhookController from "../../controllers/webhook.controller.js";

const router = Router();

/**
 * @swagger
 * /api/v1/webhooks:
 *   post:
 *     summary: Register a new webhook subscription
 *     tags: [Webhooks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userAddress
 *               - targetUrl
 *               - eventTypes
 *             properties:
 *               userAddress:
 *                 type: string
 *               targetUrl:
 *                 type: string
 *               eventTypes:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Webhook created successfully
 */
router.post("/", webhookController.createWebhook);

/**
 * @swagger
 * /api/v1/webhooks:
 *   get:
 *     summary: List all webhooks for authenticated user
 *     tags: [Webhooks]
 *     parameters:
 *       - in: query
 *         name: userAddress
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of webhook subscriptions
 */
router.get("/", webhookController.listWebhooks);

/**
 * @swagger
 * /api/v1/webhooks/{id}:
 *   delete:
 *     summary: Delete a webhook subscription
 *     tags: [Webhooks]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: userAddress
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Webhook deleted successfully
 */
router.delete("/:id", webhookController.deleteWebhook);

/**
 * @swagger
 * /api/v1/webhooks/{id}/test:
 *   post:
 *     summary: Send a test ping to a webhook
 *     tags: [Webhooks]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userAddress
 *             properties:
 *               userAddress:
 *                 type: string
 *     responses:
 *       200:
 *         description: Test webhook sent
 */
router.post("/:id/test", webhookController.testWebhook);

export default router;
