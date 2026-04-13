import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { RiskAlert, RiskSeverity } from './risk-alert.entity';
import { AuditEvent } from '../events/audit-event.entity';
import { Tenant } from '../tenants/tenant.entity';

/**
 * RiskService
 *
 * Every 6 hours, fetches the last 24 hours of audit events for every active
 * tenant, builds a statistical summary, and sends it to the Claude API for
 * privacy risk analysis. Parsed findings are stored as RiskAlert records.
 *
 * This demonstrates GDPR Article 35 (Data Protection Impact Assessment) in an
 * automated, continuous form — flagging consent gaps, high-sensitivity access,
 * third-party data sharing, and opt-out violations in near-real-time.
 */
@Injectable()
export class RiskService {
  private readonly logger = new Logger(RiskService.name);
  private readonly anthropic: Anthropic;

  constructor(
    @InjectRepository(RiskAlert)
    private readonly alertsRepo: Repository<RiskAlert>,
    @InjectRepository(AuditEvent)
    private readonly eventsRepo: Repository<AuditEvent>,
    @InjectRepository(Tenant)
    private readonly tenantsRepo: Repository<Tenant>,
    private readonly configService: ConfigService,
  ) {
    this.anthropic = new Anthropic({
      apiKey: this.configService.get<string>('ANTHROPIC_API_KEY') ?? '',
    });
  }

  // ─── Cron ─────────────────────────────────────────────────────────────────

  @Cron('0 */6 * * *')
  async runRiskAnalysis(): Promise<void> {
    this.logger.log('Starting risk analysis cycle');

    const tenants = await this.tenantsRepo.find({ where: { isActive: true } });

    for (const tenant of tenants) {
      await this.analyseRisksForTenant(tenant.id).catch((err: Error) => {
        this.logger.error(
          `Risk analysis failed for tenant ${tenant.id}: ${err.message}`,
        );
      });
    }

    this.logger.log(`Risk analysis cycle complete — checked ${tenants.length} tenants`);
  }

  // ─── Per-tenant analysis ──────────────────────────────────────────────────

  private async analyseRisksForTenant(tenantId: string): Promise<void> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const events = await this.eventsRepo.find({
      where: { tenantId, occurredAt: MoreThan(since) },
    });

    if (events.length === 0) {
      this.logger.debug(`No events in last 24h for tenant ${tenantId} — skipping`);
      return;
    }

    // Build a compact statistical summary — keeps the prompt short.
    const actionBreakdown = countBy(events, 'actionCode');
    const sensitivityBreakdown = countBy(events, 'sensitivityCode');
    const actorBreakdown = countBy(events, 'actorType');
    const thirdPartyCount = events.filter((e) => e.thirdPartyInvolved).length;
    const noConsentCount = events.filter((e) => !e.consentObtained).length;
    const optedOutCount = events.filter((e) => e.userOptedOut).length;
    const criticalCount = events.filter((e) => e.sensitivityCode === 'CRITICAL').length;

    const summary = {
      totalEvents: events.length,
      windowHours: 24,
      actionBreakdown,
      sensitivityBreakdown,
      actorBreakdown,
      thirdPartyCount,
      noConsentCount,
      optedOutCount,
      criticalCount,
    };

    const prompt = `You are a GDPR privacy compliance auditor reviewing audit events for a SaaS tenant.

The following statistics summarise data access events from the last 24 hours:
${JSON.stringify(summary, null, 2)}

Identify privacy risks, GDPR compliance gaps, or anomalies. For each finding return a JSON object with:
- "severity": one of "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
- "title": concise title, max 80 characters
- "description": explanation of the risk, max 300 characters
- "suggestedAction": recommended remediation step, max 200 characters
- "affectedEventCount": integer count of events contributing to this risk

Return ONLY a JSON array. If no risks are found, return [].
Example: [{"severity":"HIGH","title":"...","description":"...","suggestedAction":"...","affectedEventCount":3}]`;

    let rawText = '[]';

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      rawText =
        response.content[0].type === 'text' ? response.content[0].text : '[]';
    } catch (err: any) {
      this.logger.warn(
        `Claude API call failed for tenant ${tenantId}: ${err.message}`,
      );
      return;
    }

    let alerts: any[];
    try {
      // Claude sometimes wraps JSON in markdown code fences — strip them.
      const cleaned = rawText.replace(/^```json?\n?/m, '').replace(/\n?```$/m, '').trim();
      alerts = JSON.parse(cleaned);
    } catch {
      this.logger.warn(`Could not parse risk response for tenant ${tenantId}: ${rawText}`);
      return;
    }

    if (!Array.isArray(alerts) || alerts.length === 0) return;

    const now = new Date();
    const VALID_SEVERITIES: RiskSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

    for (const alert of alerts) {
      if (!VALID_SEVERITIES.includes(alert.severity)) continue;

      await this.alertsRepo.save(
        this.alertsRepo.create({
          tenantId,
          severity: alert.severity as RiskSeverity,
          title: String(alert.title ?? '').slice(0, 120),
          description: String(alert.description ?? '').slice(0, 500),
          suggestedAction: String(alert.suggestedAction ?? '').slice(0, 300),
          affectedEventCount: Number(alert.affectedEventCount) || 0,
          analysedAt: now,
        }),
      );
    }

    this.logger.log(
      `Stored ${alerts.length} risk alert(s) for tenant ${tenantId}`,
    );
  }

  // ─── Query ────────────────────────────────────────────────────────────────

  async getAlertsForTenant(tenantId: string, limit = 20): Promise<RiskAlert[]> {
    return this.alertsRepo.find({
      where: { tenantId },
      order: { analysedAt: 'DESC', severity: 'DESC' },
      take: limit,
    });
  }

  async getAlertsForUser(
    user: { type: string; tenantId?: string; dashboardUserId?: string },
    linkedTenantIds: string[],
  ): Promise<RiskAlert[]> {
    const tenantIds =
      user.type === 'dashboard_session'
        ? [user.tenantId as string]
        : linkedTenantIds;

    if (tenantIds.length === 0) return [];

    return this.alertsRepo
      .createQueryBuilder('a')
      .where('a.tenant_id IN (:...tenantIds)', { tenantIds })
      .orderBy('a.analysed_at', 'DESC')
      .addOrderBy('a.severity', 'DESC')
      .take(20)
      .getMany();
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function countBy<T>(arr: T[], key: keyof T): Record<string, number> {
  return arr.reduce<Record<string, number>>((acc, item) => {
    const k = String(item[key] ?? 'UNKNOWN');
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
}
