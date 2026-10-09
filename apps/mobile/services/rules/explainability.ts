import { RuleResult } from '@asha/shared';

export interface RuleExplanation {
  ruleId: string;
  ruleName: string;
  priority: 'low' | 'medium' | 'high';
  headline: string;
  headline_hi: string;
  detailedReason: string;
  detailedReason_hi: string;
  sourceProtocol: string;
  actionRequired: string;
  isReferralNeeded: boolean;
}

export function formatRuleExplanation(rule: RuleResult): RuleExplanation {
  const isReferral = rule.priority === 'high' || rule.nextWorkflow.toLowerCase().includes('referral');

  return {
    ruleId: rule.ruleId,
    ruleName: rule.ruleName,
    priority: rule.priority,
    headline: rule.priority === 'high' 
      ? 'CRITICAL PROTOCOL FLAG · तत्काल कार्रवाई आवश्यक' 
      : 'PROTOCOL WARNING · अनुवर्ती देखभाल आवश्यक',
    headline_hi: rule.priority === 'high'
      ? 'उच्च प्राथमिकता चेतावनी (Immediate Action Required)'
      : 'स्क्रीनिंग नियम सक्रिय (Follow-up Needed)',
    detailedReason: rule.reason,
    detailedReason_hi: rule.reason_hi || rule.reason,
    sourceProtocol: rule.protocolSource,
    actionRequired: rule.nextWorkflow,
    isReferralNeeded: isReferral
  };
}

export function generateClinicalExplainabilityCards(rules: RuleResult[]): RuleExplanation[] {
  return rules.map(r => formatRuleExplanation(r));
}
