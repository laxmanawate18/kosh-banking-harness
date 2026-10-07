---
id: edges
type: edge-list
name: All Edges
version: 0.1.0
status: draft
---
# All Edges

A flat list of every edge for tooling and graph loaders. **Agents should not load this file into context.** Search it (for example with grep) for one node id, or open the node's own file.

Total edges: 958

| From | Edge | To |
|---|---|---|
| `evt.application_submitted` | TRIGGERS | `proc.account_opening` |
| `proc.account_opening` | EMITS | `evt.account_opened` |
| `proc.account_opening` | PERFORMED_BY | `actor.onboarding_agent` |
| `proc.account_opening` | ESCALATES_TO | `actor.compliance_officer` |
| `proc.account_opening` | ESCALATES_TO | `actor.service_officer` |
| `proc.account_opening` | GOVERNED_BY | `pol.consent_privacy` |
| `proc.account_opening` | GOVERNED_BY | `pol.agent_guardrails` |
| `proc.account_opening` | GOVERNED_BY | `pol.authentication_assurance` |
| `proc.account_opening` | GOVERNED_BY | `pol.approval_matrix` |
| `proc.account_opening` | GOVERNED_BY | `pol.audit_evidence` |
| `proc.account_opening` | START | `proc.account_opening#s1:Onboarding` |
| `proc.account_opening#s1:Onboarding` | NEXT | `proc.account_opening#s2:Verify Identity` |
| `proc.account_opening#s1:Onboarding` | USES | `act.check_consent` |
| `proc.account_opening` | ACTIVITY | `proc.account_opening#s2:Verify Identity` |
| `proc.account_opening#s2:Verify Identity` | NEXT | `proc.account_opening#s3:Check Compliance` |
| `proc.account_opening#s2:Verify Identity` | USES | `act.verify_identity` |
| `proc.account_opening` | ACTIVITY | `proc.account_opening#s3:Check Compliance` |
| `proc.account_opening#s3:Check Compliance` | NEXT | `proc.account_opening#s4:Check Credit History` |
| `proc.account_opening#s3:Check Compliance` | USES | `act.screen_sanctions_pep` |
| `proc.account_opening#s3:Check Compliance` | USES | `act.risk_rate_customer` |
| `proc.account_opening#s3:Check Compliance` | REQUIRES_APPROVAL_FROM | `actor.compliance_officer` |
| `proc.account_opening` | ACTIVITY | `proc.account_opening#s4:Check Credit History` |
| `proc.account_opening#s4:Check Credit History` | NEXT | `proc.account_opening#s5:Create Account` |
| `proc.account_opening#s4:Check Credit History` | USES | `act.pull_credit_bureau` |
| `proc.account_opening` | ACTIVITY | `proc.account_opening#s5:Create Account` |
| `proc.account_opening#s5:Create Account` | NEXT | `proc.account_opening#s6:Register Nominee` |
| `proc.account_opening#s5:Create Account` | WRITES | `obj.customer` |
| `proc.account_opening#s5:Create Account` | WRITES | `obj.account` |
| `proc.account_opening` | ACTIVITY | `proc.account_opening#s6:Register Nominee` |
| `proc.account_opening#s6:Register Nominee` | NEXT | `proc.account_opening#s7:Issue Debit Card` |
| `proc.account_opening#s6:Register Nominee` | WRITES | `obj.account` |
| `proc.account_opening` | ACTIVITY | `proc.account_opening#s7:Issue Debit Card` |
| `proc.account_opening#s7:Issue Debit Card` | NEXT | `proc.account_opening#s8:Activate Digital Banking` |
| `proc.account_opening#s7:Issue Debit Card` | WRITES | `obj.card` |
| `proc.account_opening` | ACTIVITY | `proc.account_opening#s8:Activate Digital Banking` |
| `proc.account_opening#s8:Activate Digital Banking` | NEXT | `proc.account_opening#s9:Order Checks` |
| `proc.account_opening#s8:Activate Digital Banking` | USES | `act.authenticate_step_up` |
| `proc.account_opening#s8:Activate Digital Banking` | WRITES | `obj.customer` |
| `proc.account_opening` | FINALIZE | `proc.account_opening#s9:Order Checks` |
| `proc.account_opening#s9:Order Checks` | USES | `act.notify_customer` |
| `proc.account_opening` | READS | `obj.customer` |
| `proc.account_opening` | READS | `obj.document` |
| `proc.account_opening` | READS | `obj.product` |
| `proc.account_opening` | READS | `obj.consent` |
| `evt.kyc_review_due` | TRIGGERS | `proc.perpetual_kyc` |
| `evt.profile_changed` | TRIGGERS | `proc.perpetual_kyc` |
| `evt.adverse_media_hit` | TRIGGERS | `proc.perpetual_kyc` |
| `proc.perpetual_kyc` | PERFORMED_BY | `actor.kyc_agent` |
| `proc.perpetual_kyc` | ESCALATES_TO | `actor.compliance_officer` |
| `proc.perpetual_kyc` | GOVERNED_BY | `pol.consent_privacy` |
| `proc.perpetual_kyc` | GOVERNED_BY | `pol.agent_guardrails` |
| `proc.perpetual_kyc` | GOVERNED_BY | `pol.approval_matrix` |
| `proc.perpetual_kyc` | GOVERNED_BY | `pol.audit_evidence` |
| `proc.perpetual_kyc` | START | `proc.perpetual_kyc#s1:Detect Trigger` |
| `proc.perpetual_kyc#s1:Detect Trigger` | NEXT | `proc.perpetual_kyc#s2:Refresh Profile` |
| `proc.perpetual_kyc#s1:Detect Trigger` | USES | `act.build_customer_context` |
| `proc.perpetual_kyc` | ACTIVITY | `proc.perpetual_kyc#s2:Refresh Profile` |
| `proc.perpetual_kyc#s2:Refresh Profile` | NEXT | `proc.perpetual_kyc#s3:Re-screen` |
| `proc.perpetual_kyc` | ACTIVITY | `proc.perpetual_kyc#s3:Re-screen` |
| `proc.perpetual_kyc#s3:Re-screen` | NEXT | `proc.perpetual_kyc#s4:Re-score Risk` |
| `proc.perpetual_kyc#s3:Re-screen` | USES | `act.screen_sanctions_pep` |
| `proc.perpetual_kyc` | ACTIVITY | `proc.perpetual_kyc#s4:Re-score Risk` |
| `proc.perpetual_kyc#s4:Re-score Risk` | NEXT | `proc.perpetual_kyc#s5:Request Documents` |
| `proc.perpetual_kyc#s4:Re-score Risk` | USES | `act.risk_rate_customer` |
| `proc.perpetual_kyc` | ACTIVITY | `proc.perpetual_kyc#s5:Request Documents` |
| `proc.perpetual_kyc#s5:Request Documents` | NEXT | `proc.perpetual_kyc#s6:Officer Review` |
| `proc.perpetual_kyc#s5:Request Documents` | USES | `act.collect_documents` |
| `proc.perpetual_kyc` | ACTIVITY | `proc.perpetual_kyc#s6:Officer Review` |
| `proc.perpetual_kyc#s6:Officer Review` | NEXT | `proc.perpetual_kyc#s7:Update KYC` |
| `proc.perpetual_kyc#s6:Officer Review` | USES | `act.route_to_approver` |
| `proc.perpetual_kyc#s6:Officer Review` | REQUIRES_APPROVAL_FROM | `actor.compliance_officer` |
| `proc.perpetual_kyc` | FINALIZE | `proc.perpetual_kyc#s7:Update KYC` |
| `proc.perpetual_kyc#s7:Update KYC` | USES | `act.notify_customer` |
| `proc.perpetual_kyc#s7:Update KYC` | WRITES | `obj.kyc_record` |
| `proc.perpetual_kyc` | READS | `obj.customer` |
| `proc.perpetual_kyc` | READS | `obj.kyc_record` |
| `proc.perpetual_kyc` | READS | `obj.risk_factor` |
| `evt.customer_signal` | TRIGGERS | `proc.next_best_offer` |
| `evt.account_opened` | TRIGGERS | `proc.next_best_offer` |
| `proc.next_best_offer` | PERFORMED_BY | `actor.marketing_agent` |
| `proc.next_best_offer` | ESCALATES_TO | `actor.relationship_manager` |
| `proc.next_best_offer` | GOVERNED_BY | `pol.consent_privacy` |
| `proc.next_best_offer` | GOVERNED_BY | `pol.agent_guardrails` |
| `proc.next_best_offer` | GOVERNED_BY | `pol.audit_evidence` |
| `proc.next_best_offer` | START | `proc.next_best_offer#s1:Detect Signal` |
| `proc.next_best_offer#s1:Detect Signal` | NEXT | `proc.next_best_offer#s2:Build Customer Context` |
| `proc.next_best_offer` | ACTIVITY | `proc.next_best_offer#s2:Build Customer Context` |
| `proc.next_best_offer#s2:Build Customer Context` | NEXT | `proc.next_best_offer#s3:Check Consent` |
| `proc.next_best_offer#s2:Build Customer Context` | USES | `act.build_customer_context` |
| `proc.next_best_offer` | ACTIVITY | `proc.next_best_offer#s3:Check Consent` |
| `proc.next_best_offer#s3:Check Consent` | NEXT | `proc.next_best_offer#s4:Generate Candidates` |
| `proc.next_best_offer#s3:Check Consent` | USES | `act.check_consent` |
| `proc.next_best_offer` | ACTIVITY | `proc.next_best_offer#s4:Generate Candidates` |
| `proc.next_best_offer#s4:Generate Candidates` | NEXT | `proc.next_best_offer#s5:Check Eligibility and Suitability` |
| `proc.next_best_offer` | ACTIVITY | `proc.next_best_offer#s5:Check Eligibility and Suitability` |
| `proc.next_best_offer#s5:Check Eligibility and Suitability` | NEXT | `proc.next_best_offer#s6:Rank by Propensity` |
| `proc.next_best_offer#s5:Check Eligibility and Suitability` | USES | `act.check_eligibility_suitability` |
| `proc.next_best_offer#s5:Check Eligibility and Suitability` | REQUIRES_APPROVAL_FROM | `actor.relationship_manager` |
| `proc.next_best_offer` | ACTIVITY | `proc.next_best_offer#s6:Rank by Propensity` |
| `proc.next_best_offer#s6:Rank by Propensity` | NEXT | `proc.next_best_offer#s7:Choose Channel and Time` |
| `proc.next_best_offer` | ACTIVITY | `proc.next_best_offer#s7:Choose Channel and Time` |
| `proc.next_best_offer#s7:Choose Channel and Time` | NEXT | `proc.next_best_offer#s8:Deliver` |
| `proc.next_best_offer` | ACTIVITY | `proc.next_best_offer#s8:Deliver` |
| `proc.next_best_offer#s8:Deliver` | NEXT | `proc.next_best_offer#s9:Capture Response` |
| `proc.next_best_offer#s8:Deliver` | USES | `act.notify_customer` |
| `proc.next_best_offer` | FINALIZE | `proc.next_best_offer#s9:Capture Response` |
| `proc.next_best_offer#s9:Capture Response` | USES | `act.write_back_outcome` |
| `proc.next_best_offer#s9:Capture Response` | WRITES | `obj.lead_opportunity` |
| `proc.next_best_offer#s9:Capture Response` | WRITES | `obj.interaction` |
| `proc.next_best_offer` | READS | `obj.customer` |
| `proc.next_best_offer` | READS | `obj.segment` |
| `proc.next_best_offer` | READS | `obj.offer` |
| `proc.next_best_offer` | READS | `obj.product` |
| `proc.next_best_offer` | READS | `obj.consent` |
| `evt.churn_signal` | TRIGGERS | `proc.churn_retention` |
| `proc.churn_retention` | PERFORMED_BY | `actor.retention_agent` |
| `proc.churn_retention` | ESCALATES_TO | `actor.relationship_manager` |
| `proc.churn_retention` | GOVERNED_BY | `pol.consent_privacy` |
| `proc.churn_retention` | GOVERNED_BY | `pol.approval_matrix` |
| `proc.churn_retention` | GOVERNED_BY | `pol.audit_evidence` |
| `proc.churn_retention` | START | `proc.churn_retention#s1:Detect Signal` |
| `proc.churn_retention#s1:Detect Signal` | NEXT | `proc.churn_retention#s2:Diagnose Reason` |
| `proc.churn_retention` | ACTIVITY | `proc.churn_retention#s2:Diagnose Reason` |
| `proc.churn_retention#s2:Diagnose Reason` | NEXT | `proc.churn_retention#s3:Select Intervention` |
| `proc.churn_retention#s2:Diagnose Reason` | USES | `act.build_customer_context` |
| `proc.churn_retention` | ACTIVITY | `proc.churn_retention#s3:Select Intervention` |
| `proc.churn_retention#s3:Select Intervention` | NEXT | `proc.churn_retention#s4:Assign RM` |
| `proc.churn_retention` | ACTIVITY | `proc.churn_retention#s4:Assign RM` |
| `proc.churn_retention#s4:Assign RM` | NEXT | `proc.churn_retention#s5:Outreach` |
| `proc.churn_retention#s4:Assign RM` | USES | `act.route_to_approver` |
| `proc.churn_retention#s4:Assign RM` | REQUIRES_APPROVAL_FROM | `actor.relationship_manager` |
| `proc.churn_retention` | ACTIVITY | `proc.churn_retention#s5:Outreach` |
| `proc.churn_retention#s5:Outreach` | NEXT | `proc.churn_retention#s6:Make Retention Offer` |
| `proc.churn_retention#s5:Outreach` | USES | `act.check_consent` |
| `proc.churn_retention#s5:Outreach` | USES | `act.notify_customer` |
| `proc.churn_retention` | ACTIVITY | `proc.churn_retention#s6:Make Retention Offer` |
| `proc.churn_retention#s6:Make Retention Offer` | NEXT | `proc.churn_retention#s7:Log Outcome` |
| `proc.churn_retention#s6:Make Retention Offer` | USES | `act.check_eligibility_suitability` |
| `proc.churn_retention#s6:Make Retention Offer` | REQUIRES_APPROVAL_FROM | `actor.relationship_manager` |
| `proc.churn_retention` | FINALIZE | `proc.churn_retention#s7:Log Outcome` |
| `proc.churn_retention#s7:Log Outcome` | USES | `act.write_back_outcome` |
| `proc.churn_retention#s7:Log Outcome` | WRITES | `obj.lead_opportunity` |
| `proc.churn_retention#s7:Log Outcome` | WRITES | `obj.interaction` |
| `proc.churn_retention` | READS | `obj.customer` |
| `proc.churn_retention` | READS | `obj.interaction` |
| `proc.churn_retention` | READS | `obj.case` |
| `evt.case_received` | TRIGGERS | `proc.service_case` |
| `proc.service_case` | PERFORMED_BY | `actor.service_agent` |
| `proc.service_case` | ESCALATES_TO | `actor.service_officer` |
| `proc.service_case` | GOVERNED_BY | `pol.agent_guardrails` |
| `proc.service_case` | GOVERNED_BY | `pol.approval_matrix` |
| `proc.service_case` | GOVERNED_BY | `pol.audit_evidence` |
| `proc.service_case` | START | `proc.service_case#s1:Classify` |
| `proc.service_case#s1:Classify` | NEXT | `proc.service_case#s2:Assign` |
| `proc.service_case#s1:Classify` | USES | `act.open_case` |
| `proc.service_case` | ACTIVITY | `proc.service_case#s2:Assign` |
| `proc.service_case#s2:Assign` | NEXT | `proc.service_case#s3:Track SLA` |
| `proc.service_case` | ACTIVITY | `proc.service_case#s3:Track SLA` |
| `proc.service_case#s3:Track SLA` | NEXT | `proc.service_case#s4:Investigate` |
| `proc.service_case` | ACTIVITY | `proc.service_case#s4:Investigate` |
| `proc.service_case#s4:Investigate` | NEXT | `proc.service_case#s5:Resolve` |
| `proc.service_case#s4:Investigate` | USES | `act.build_customer_context` |
| `proc.service_case` | ACTIVITY | `proc.service_case#s5:Resolve` |
| `proc.service_case#s5:Resolve` | NEXT | `proc.service_case#s6:Confirm with Customer` |
| `proc.service_case` | ACTIVITY | `proc.service_case#s6:Confirm with Customer` |
| `proc.service_case#s6:Confirm with Customer` | NEXT | `proc.service_case#s7:Record Root Cause` |
| `proc.service_case#s6:Confirm with Customer` | USES | `act.notify_customer` |
| `proc.service_case` | FINALIZE | `proc.service_case#s7:Record Root Cause` |
| `proc.service_case#s7:Record Root Cause` | USES | `act.write_back_outcome` |
| `proc.service_case#s7:Record Root Cause` | WRITES | `obj.case` |
| `proc.service_case` | READS | `obj.customer` |
| `proc.service_case` | READS | `obj.case` |
| `proc.service_case` | READS | `obj.account` |
| `proc.service_case` | READS | `obj.transaction` |
| `proc.service_case` | READS | `obj.interaction` |
| `evt.contact_change_requested` | TRIGGERS | `proc.contact_detail_change` |
| `proc.contact_detail_change` | PERFORMED_BY | `actor.service_agent` |
| `proc.contact_detail_change` | ESCALATES_TO | `actor.service_officer` |
| `proc.contact_detail_change` | ESCALATES_TO | `actor.fraud_analyst` |
| `proc.contact_detail_change` | GOVERNED_BY | `pol.authentication_assurance` |
| `proc.contact_detail_change` | GOVERNED_BY | `pol.agent_guardrails` |
| `proc.contact_detail_change` | GOVERNED_BY | `pol.audit_evidence` |
| `proc.contact_detail_change` | START | `proc.contact_detail_change#s1:Receive Request` |
| `proc.contact_detail_change#s1:Receive Request` | NEXT | `proc.contact_detail_change#s2:Authenticate` |
| `proc.contact_detail_change` | ACTIVITY | `proc.contact_detail_change#s2:Authenticate` |
| `proc.contact_detail_change#s2:Authenticate` | NEXT | `proc.contact_detail_change#s3:Verify New Contact` |
| `proc.contact_detail_change#s2:Authenticate` | USES | `act.authenticate_step_up` |
| `proc.contact_detail_change` | ACTIVITY | `proc.contact_detail_change#s3:Verify New Contact` |
| `proc.contact_detail_change#s3:Verify New Contact` | NEXT | `proc.contact_detail_change#s4:Apply Cooling Period` |
| `proc.contact_detail_change` | ACTIVITY | `proc.contact_detail_change#s4:Apply Cooling Period` |
| `proc.contact_detail_change#s4:Apply Cooling Period` | NEXT | `proc.contact_detail_change#s5:Update Customer Record` |
| `proc.contact_detail_change` | ACTIVITY | `proc.contact_detail_change#s5:Update Customer Record` |
| `proc.contact_detail_change#s5:Update Customer Record` | NEXT | `proc.contact_detail_change#s6:Notify Old and New Contact` |
| `proc.contact_detail_change#s5:Update Customer Record` | WRITES | `obj.customer` |
| `proc.contact_detail_change` | FINALIZE | `proc.contact_detail_change#s6:Notify Old and New Contact` |
| `proc.contact_detail_change#s6:Notify Old and New Contact` | USES | `act.notify_customer` |
| `proc.contact_detail_change` | READS | `obj.customer` |
| `evt.loan_requested` | TRIGGERS | `proc.loan_origination` |
| `proc.loan_origination` | EMITS | `evt.loan_disbursed` |
| `proc.loan_origination` | PERFORMED_BY | `actor.lending_agent` |
| `proc.loan_origination` | ESCALATES_TO | `actor.credit_officer` |
| `proc.loan_origination` | GOVERNED_BY | `pol.consent_privacy` |
| `proc.loan_origination` | GOVERNED_BY | `pol.agent_guardrails` |
| `proc.loan_origination` | GOVERNED_BY | `pol.approval_matrix` |
| `proc.loan_origination` | GOVERNED_BY | `pol.audit_evidence` |
| `proc.loan_origination` | START | `proc.loan_origination#s1:Pre-qualify` |
| `proc.loan_origination#s1:Pre-qualify` | NEXT | `proc.loan_origination#s2:Collect Documents` |
| `proc.loan_origination#s1:Pre-qualify` | USES | `act.check_eligibility_suitability` |
| `proc.loan_origination#s1:Pre-qualify` | USES | `act.check_consent` |
| `proc.loan_origination` | ACTIVITY | `proc.loan_origination#s2:Collect Documents` |
| `proc.loan_origination#s2:Collect Documents` | NEXT | `proc.loan_origination#s3:Verify Identity` |
| `proc.loan_origination#s2:Collect Documents` | USES | `act.collect_documents` |
| `proc.loan_origination` | ACTIVITY | `proc.loan_origination#s3:Verify Identity` |
| `proc.loan_origination#s3:Verify Identity` | NEXT | `proc.loan_origination#s4:Pull Credit Bureau` |
| `proc.loan_origination#s3:Verify Identity` | USES | `act.verify_identity` |
| `proc.loan_origination` | ACTIVITY | `proc.loan_origination#s4:Pull Credit Bureau` |
| `proc.loan_origination#s4:Pull Credit Bureau` | NEXT | `proc.loan_origination#s5:Assess Income and FOIR` |
| `proc.loan_origination#s4:Pull Credit Bureau` | USES | `act.pull_credit_bureau` |
| `proc.loan_origination` | ACTIVITY | `proc.loan_origination#s5:Assess Income and FOIR` |
| `proc.loan_origination#s5:Assess Income and FOIR` | NEXT | `proc.loan_origination#s6:Underwrite` |
| `proc.loan_origination#s5:Assess Income and FOIR` | WRITES | `obj.loan_application` |
| `proc.loan_origination` | ACTIVITY | `proc.loan_origination#s6:Underwrite` |
| `proc.loan_origination#s6:Underwrite` | NEXT | `proc.loan_origination#s7:Price` |
| `proc.loan_origination#s6:Underwrite` | USES | `act.route_to_approver` |
| `proc.loan_origination#s6:Underwrite` | REQUIRES_APPROVAL_FROM | `actor.credit_officer` |
| `proc.loan_origination#s6:Underwrite` | WRITES | `obj.loan_application` |
| `proc.loan_origination` | ACTIVITY | `proc.loan_origination#s7:Price` |
| `proc.loan_origination#s7:Price` | NEXT | `proc.loan_origination#s8:Sanction` |
| `proc.loan_origination` | ACTIVITY | `proc.loan_origination#s8:Sanction` |
| `proc.loan_origination#s8:Sanction` | NEXT | `proc.loan_origination#s9:Disburse` |
| `proc.loan_origination#s8:Sanction` | USES | `act.notify_customer` |
| `proc.loan_origination#s8:Sanction` | WRITES | `obj.loan` |
| `proc.loan_origination` | ACTIVITY | `proc.loan_origination#s9:Disburse` |
| `proc.loan_origination#s9:Disburse` | NEXT | `proc.loan_origination#s10:Open Loan Account` |
| `proc.loan_origination#s9:Disburse` | USES | `act.post_to_ledger` |
| `proc.loan_origination#s9:Disburse` | REQUIRES_APPROVAL_FROM | `actor.credit_officer` |
| `proc.loan_origination#s9:Disburse` | WRITES | `obj.loan` |
| `proc.loan_origination#s9:Disburse` | WRITES | `obj.transaction` |
| `proc.loan_origination` | FINALIZE | `proc.loan_origination#s10:Open Loan Account` |
| `proc.loan_origination#s10:Open Loan Account` | WRITES | `obj.loan` |
| `proc.loan_origination#s10:Open Loan Account` | WRITES | `obj.repayment` |
| `proc.loan_origination` | READS | `obj.customer` |
| `proc.loan_origination` | READS | `obj.document` |
| `proc.loan_origination` | READS | `obj.credit_report` |
| `proc.loan_origination` | READS | `obj.product` |
| `proc.loan_origination` | READS | `obj.consent` |
| `evt.emi_missed` | TRIGGERS | `proc.collections` |
| `evt.loan_disbursed` | TRIGGERS | `proc.collections` |
| `proc.collections` | PERFORMED_BY | `actor.collections_agent` |
| `proc.collections` | ESCALATES_TO | `actor.collections_officer` |
| `proc.collections` | GOVERNED_BY | `pol.agent_guardrails` |
| `proc.collections` | GOVERNED_BY | `pol.consent_privacy` |
| `proc.collections` | GOVERNED_BY | `pol.approval_matrix` |
| `proc.collections` | GOVERNED_BY | `pol.audit_evidence` |
| `proc.collections` | START | `proc.collections#s1:Remind` |
| `proc.collections#s1:Remind` | NEXT | `proc.collections#s2:Contact` |
| `proc.collections#s1:Remind` | USES | `act.notify_customer` |
| `proc.collections` | ACTIVITY | `proc.collections#s2:Contact` |
| `proc.collections#s2:Contact` | NEXT | `proc.collections#s3:Record Promise-to-Pay` |
| `proc.collections#s2:Contact` | USES | `act.check_consent` |
| `proc.collections#s2:Contact` | USES | `act.open_case` |
| `proc.collections` | ACTIVITY | `proc.collections#s3:Record Promise-to-Pay` |
| `proc.collections#s3:Record Promise-to-Pay` | NEXT | `proc.collections#s4:Offer Restructure` |
| `proc.collections#s3:Record Promise-to-Pay` | WRITES | `obj.collections_case` |
| `proc.collections` | ACTIVITY | `proc.collections#s4:Offer Restructure` |
| `proc.collections#s4:Offer Restructure` | NEXT | `proc.collections#s5:Escalate` |
| `proc.collections#s4:Offer Restructure` | USES | `act.route_to_approver` |
| `proc.collections#s4:Offer Restructure` | REQUIRES_APPROVAL_FROM | `actor.collections_officer` |
| `proc.collections` | ACTIVITY | `proc.collections#s5:Escalate` |
| `proc.collections#s5:Escalate` | NEXT | `proc.collections#s6:Regularise or Close` |
| `proc.collections#s5:Escalate` | USES | `act.route_to_approver` |
| `proc.collections#s5:Escalate` | REQUIRES_APPROVAL_FROM | `actor.collections_officer` |
| `proc.collections` | FINALIZE | `proc.collections#s6:Regularise or Close` |
| `proc.collections#s6:Regularise or Close` | USES | `act.write_back_outcome` |
| `proc.collections#s6:Regularise or Close` | WRITES | `obj.collections_case` |
| `proc.collections#s6:Regularise or Close` | WRITES | `obj.loan` |
| `proc.collections` | READS | `obj.loan` |
| `proc.collections` | READS | `obj.repayment` |
| `proc.collections` | READS | `obj.customer` |
| `proc.collections` | READS | `obj.consent` |
| `evt.payment_requested` | TRIGGERS | `proc.payment_authorisation` |
| `proc.payment_authorisation` | PERFORMED_BY | `actor.payments_agent` |
| `proc.payment_authorisation` | ESCALATES_TO | `actor.fraud_analyst` |
| `proc.payment_authorisation` | ESCALATES_TO | `actor.service_officer` |
| `proc.payment_authorisation` | GOVERNED_BY | `pol.authentication_assurance` |
| `proc.payment_authorisation` | GOVERNED_BY | `pol.approval_matrix` |
| `proc.payment_authorisation` | GOVERNED_BY | `pol.agent_guardrails` |
| `proc.payment_authorisation` | GOVERNED_BY | `pol.audit_evidence` |
| `proc.payment_authorisation` | START | `proc.payment_authorisation#s1:Authenticate` |
| `proc.payment_authorisation#s1:Authenticate` | NEXT | `proc.payment_authorisation#s2:Validate Beneficiary` |
| `proc.payment_authorisation#s1:Authenticate` | USES | `act.authenticate_step_up` |
| `proc.payment_authorisation` | ACTIVITY | `proc.payment_authorisation#s2:Validate Beneficiary` |
| `proc.payment_authorisation#s2:Validate Beneficiary` | NEXT | `proc.payment_authorisation#s3:Check Limits and Balance` |
| `proc.payment_authorisation#s2:Validate Beneficiary` | USES | `act.validate_beneficiary` |
| `proc.payment_authorisation` | ACTIVITY | `proc.payment_authorisation#s3:Check Limits and Balance` |
| `proc.payment_authorisation#s3:Check Limits and Balance` | NEXT | `proc.payment_authorisation#s4:Score Risk` |
| `proc.payment_authorisation#s3:Check Limits and Balance` | USES | `act.check_limits_and_balance` |
| `proc.payment_authorisation` | ACTIVITY | `proc.payment_authorisation#s4:Score Risk` |
| `proc.payment_authorisation#s4:Score Risk` | NEXT | `proc.payment_authorisation#s5:Decide` |
| `proc.payment_authorisation#s4:Score Risk` | USES | `act.score_transaction_risk` |
| `proc.payment_authorisation` | ACTIVITY | `proc.payment_authorisation#s5:Decide` |
| `proc.payment_authorisation#s5:Decide` | NEXT | `proc.payment_authorisation#s6:Step-up Challenge` |
| `proc.payment_authorisation#s5:Decide` | WRITES | `obj.payment` |
| `proc.payment_authorisation` | ACTIVITY | `proc.payment_authorisation#s6:Step-up Challenge` |
| `proc.payment_authorisation#s6:Step-up Challenge` | NEXT | `proc.payment_authorisation#s7:Place Hold` |
| `proc.payment_authorisation#s6:Step-up Challenge` | USES | `act.authenticate_step_up` |
| `proc.payment_authorisation` | ACTIVITY | `proc.payment_authorisation#s7:Place Hold` |
| `proc.payment_authorisation#s7:Place Hold` | NEXT | `proc.payment_authorisation#s8:Execute on Rail` |
| `proc.payment_authorisation#s7:Place Hold` | USES | `act.place_balance_hold` |
| `proc.payment_authorisation` | ACTIVITY | `proc.payment_authorisation#s8:Execute on Rail` |
| `proc.payment_authorisation#s8:Execute on Rail` | NEXT | `proc.payment_authorisation#s9:Post to Ledger` |
| `proc.payment_authorisation#s8:Execute on Rail` | WRITES | `obj.payment` |
| `proc.payment_authorisation` | ACTIVITY | `proc.payment_authorisation#s9:Post to Ledger` |
| `proc.payment_authorisation#s9:Post to Ledger` | NEXT | `proc.payment_authorisation#s10:Notify` |
| `proc.payment_authorisation#s9:Post to Ledger` | USES | `act.post_to_ledger` |
| `proc.payment_authorisation#s9:Post to Ledger` | WRITES | `obj.transaction` |
| `proc.payment_authorisation#s9:Post to Ledger` | WRITES | `obj.journal_entry` |
| `proc.payment_authorisation` | FINALIZE | `proc.payment_authorisation#s10:Notify` |
| `proc.payment_authorisation#s10:Notify` | USES | `act.notify_customer` |
| `proc.payment_authorisation` | READS | `obj.account` |
| `proc.payment_authorisation` | READS | `obj.beneficiary` |
| `proc.payment_authorisation` | READS | `obj.payment` |
| `proc.payment_authorisation` | READS | `obj.agent_delegation` |
| `evt.suspicious_activity` | TRIGGERS | `proc.fraud_and_dispute` |
| `proc.fraud_and_dispute` | PERFORMED_BY | `actor.fraud_agent` |
| `proc.fraud_and_dispute` | ESCALATES_TO | `actor.fraud_analyst` |
| `proc.fraud_and_dispute` | GOVERNED_BY | `pol.agent_guardrails` |
| `proc.fraud_and_dispute` | GOVERNED_BY | `pol.approval_matrix` |
| `proc.fraud_and_dispute` | GOVERNED_BY | `pol.audit_evidence` |
| `proc.fraud_and_dispute` | START | `proc.fraud_and_dispute#s1:Detect or Receive Report` |
| `proc.fraud_and_dispute#s1:Detect or Receive Report` | NEXT | `proc.fraud_and_dispute#s2:Block Card or Freeze` |
| `proc.fraud_and_dispute` | ACTIVITY | `proc.fraud_and_dispute#s2:Block Card or Freeze` |
| `proc.fraud_and_dispute#s2:Block Card or Freeze` | NEXT | `proc.fraud_and_dispute#s3:Contact Customer` |
| `proc.fraud_and_dispute#s2:Block Card or Freeze` | WRITES | `obj.card` |
| `proc.fraud_and_dispute#s2:Block Card or Freeze` | WRITES | `obj.account` |
| `proc.fraud_and_dispute` | ACTIVITY | `proc.fraud_and_dispute#s3:Contact Customer` |
| `proc.fraud_and_dispute#s3:Contact Customer` | NEXT | `proc.fraud_and_dispute#s4:Raise Dispute` |
| `proc.fraud_and_dispute#s3:Contact Customer` | USES | `act.authenticate_step_up` |
| `proc.fraud_and_dispute#s3:Contact Customer` | USES | `act.notify_customer` |
| `proc.fraud_and_dispute` | ACTIVITY | `proc.fraud_and_dispute#s4:Raise Dispute` |
| `proc.fraud_and_dispute#s4:Raise Dispute` | NEXT | `proc.fraud_and_dispute#s5:Provisional Credit` |
| `proc.fraud_and_dispute#s4:Raise Dispute` | USES | `act.open_case` |
| `proc.fraud_and_dispute#s4:Raise Dispute` | WRITES | `obj.dispute` |
| `proc.fraud_and_dispute#s4:Raise Dispute` | WRITES | `obj.case` |
| `proc.fraud_and_dispute` | ACTIVITY | `proc.fraud_and_dispute#s5:Provisional Credit` |
| `proc.fraud_and_dispute#s5:Provisional Credit` | NEXT | `proc.fraud_and_dispute#s6:Investigate` |
| `proc.fraud_and_dispute#s5:Provisional Credit` | USES | `act.post_to_ledger` |
| `proc.fraud_and_dispute#s5:Provisional Credit` | REQUIRES_APPROVAL_FROM | `actor.fraud_analyst` |
| `proc.fraud_and_dispute` | ACTIVITY | `proc.fraud_and_dispute#s6:Investigate` |
| `proc.fraud_and_dispute#s6:Investigate` | NEXT | `proc.fraud_and_dispute#s7:Chargeback or Recover` |
| `proc.fraud_and_dispute#s6:Investigate` | REQUIRES_APPROVAL_FROM | `actor.fraud_analyst` |
| `proc.fraud_and_dispute` | ACTIVITY | `proc.fraud_and_dispute#s7:Chargeback or Recover` |
| `proc.fraud_and_dispute#s7:Chargeback or Recover` | NEXT | `proc.fraud_and_dispute#s8:Resolve` |
| `proc.fraud_and_dispute` | FINALIZE | `proc.fraud_and_dispute#s8:Resolve` |
| `proc.fraud_and_dispute#s8:Resolve` | USES | `act.notify_customer` |
| `proc.fraud_and_dispute#s8:Resolve` | WRITES | `obj.dispute` |
| `proc.fraud_and_dispute` | READS | `obj.transaction` |
| `proc.fraud_and_dispute` | READS | `obj.card` |
| `proc.fraud_and_dispute` | READS | `obj.account` |
| `proc.fraud_and_dispute` | READS | `obj.customer` |
| `evt.card_requested` | TRIGGERS | `proc.card_lifecycle` |
| `proc.card_lifecycle` | PERFORMED_BY | `actor.payments_agent` |
| `proc.card_lifecycle` | ESCALATES_TO | `actor.service_officer` |
| `proc.card_lifecycle` | ESCALATES_TO | `actor.fraud_analyst` |
| `proc.card_lifecycle` | GOVERNED_BY | `pol.authentication_assurance` |
| `proc.card_lifecycle` | GOVERNED_BY | `pol.agent_guardrails` |
| `proc.card_lifecycle` | GOVERNED_BY | `pol.audit_evidence` |
| `proc.card_lifecycle` | START | `proc.card_lifecycle#s1:Request` |
| `proc.card_lifecycle#s1:Request` | NEXT | `proc.card_lifecycle#s2:Issue` |
| `proc.card_lifecycle#s1:Request` | USES | `act.authenticate_step_up` |
| `proc.card_lifecycle` | ACTIVITY | `proc.card_lifecycle#s2:Issue` |
| `proc.card_lifecycle#s2:Issue` | NEXT | `proc.card_lifecycle#s3:Activate` |
| `proc.card_lifecycle#s2:Issue` | WRITES | `obj.card` |
| `proc.card_lifecycle` | ACTIVITY | `proc.card_lifecycle#s3:Activate` |
| `proc.card_lifecycle#s3:Activate` | NEXT | `proc.card_lifecycle#s4:Set Limits` |
| `proc.card_lifecycle#s3:Activate` | USES | `act.authenticate_step_up` |
| `proc.card_lifecycle#s3:Activate` | WRITES | `obj.card` |
| `proc.card_lifecycle` | ACTIVITY | `proc.card_lifecycle#s4:Set Limits` |
| `proc.card_lifecycle#s4:Set Limits` | NEXT | `proc.card_lifecycle#s5:Block or Replace` |
| `proc.card_lifecycle#s4:Set Limits` | USES | `act.check_limits_and_balance` |
| `proc.card_lifecycle#s4:Set Limits` | WRITES | `obj.card` |
| `proc.card_lifecycle` | ACTIVITY | `proc.card_lifecycle#s5:Block or Replace` |
| `proc.card_lifecycle#s5:Block or Replace` | NEXT | `proc.card_lifecycle#s6:Renew` |
| `proc.card_lifecycle#s5:Block or Replace` | WRITES | `obj.card` |
| `proc.card_lifecycle` | ACTIVITY | `proc.card_lifecycle#s6:Renew` |
| `proc.card_lifecycle#s6:Renew` | NEXT | `proc.card_lifecycle#s7:Close` |
| `proc.card_lifecycle` | FINALIZE | `proc.card_lifecycle#s7:Close` |
| `proc.card_lifecycle#s7:Close` | USES | `act.notify_customer` |
| `proc.card_lifecycle#s7:Close` | WRITES | `obj.card` |
| `proc.card_lifecycle` | READS | `obj.card` |
| `proc.card_lifecycle` | READS | `obj.account` |
| `proc.card_lifecycle` | READS | `obj.customer` |
| `evt.beneficiary_add_requested` | TRIGGERS | `proc.beneficiary_addition` |
| `proc.beneficiary_addition` | PERFORMED_BY | `actor.payments_agent` |
| `proc.beneficiary_addition` | ESCALATES_TO | `actor.fraud_analyst` |
| `proc.beneficiary_addition` | GOVERNED_BY | `pol.authentication_assurance` |
| `proc.beneficiary_addition` | GOVERNED_BY | `pol.agent_guardrails` |
| `proc.beneficiary_addition` | GOVERNED_BY | `pol.audit_evidence` |
| `proc.beneficiary_addition` | START | `proc.beneficiary_addition#s1:Receive Request` |
| `proc.beneficiary_addition#s1:Receive Request` | NEXT | `proc.beneficiary_addition#s2:Authenticate` |
| `proc.beneficiary_addition` | ACTIVITY | `proc.beneficiary_addition#s2:Authenticate` |
| `proc.beneficiary_addition#s2:Authenticate` | NEXT | `proc.beneficiary_addition#s3:Validate Account Details` |
| `proc.beneficiary_addition#s2:Authenticate` | USES | `act.authenticate_step_up` |
| `proc.beneficiary_addition` | ACTIVITY | `proc.beneficiary_addition#s3:Validate Account Details` |
| `proc.beneficiary_addition#s3:Validate Account Details` | NEXT | `proc.beneficiary_addition#s4:Risk Check` |
| `proc.beneficiary_addition#s3:Validate Account Details` | USES | `act.validate_beneficiary` |
| `proc.beneficiary_addition` | ACTIVITY | `proc.beneficiary_addition#s4:Risk Check` |
| `proc.beneficiary_addition#s4:Risk Check` | NEXT | `proc.beneficiary_addition#s5:Apply Cooling-off Limit` |
| `proc.beneficiary_addition#s4:Risk Check` | USES | `act.score_transaction_risk` |
| `proc.beneficiary_addition` | ACTIVITY | `proc.beneficiary_addition#s5:Apply Cooling-off Limit` |
| `proc.beneficiary_addition#s5:Apply Cooling-off Limit` | NEXT | `proc.beneficiary_addition#s6:Activate Payee` |
| `proc.beneficiary_addition#s5:Apply Cooling-off Limit` | WRITES | `obj.beneficiary` |
| `proc.beneficiary_addition` | FINALIZE | `proc.beneficiary_addition#s6:Activate Payee` |
| `proc.beneficiary_addition#s6:Activate Payee` | USES | `act.notify_customer` |
| `proc.beneficiary_addition#s6:Activate Payee` | WRITES | `obj.beneficiary` |
| `proc.beneficiary_addition` | READS | `obj.customer` |
| `proc.beneficiary_addition` | READS | `obj.beneficiary` |
| `evt.deposit_opened` | TRIGGERS | `proc.term_deposit_lifecycle` |
| `evt.maturity_approaching` | TRIGGERS | `proc.term_deposit_lifecycle` |
| `proc.term_deposit_lifecycle` | PERFORMED_BY | `actor.operations_agent` |
| `proc.term_deposit_lifecycle` | ESCALATES_TO | `actor.operations_officer` |
| `proc.term_deposit_lifecycle` | ESCALATES_TO | `actor.service_officer` |
| `proc.term_deposit_lifecycle` | GOVERNED_BY | `pol.authentication_assurance` |
| `proc.term_deposit_lifecycle` | GOVERNED_BY | `pol.consent_privacy` |
| `proc.term_deposit_lifecycle` | GOVERNED_BY | `pol.audit_evidence` |
| `proc.term_deposit_lifecycle` | START | `proc.term_deposit_lifecycle#s1:Fund` |
| `proc.term_deposit_lifecycle#s1:Fund` | NEXT | `proc.term_deposit_lifecycle#s2:Book` |
| `proc.term_deposit_lifecycle#s1:Fund` | USES | `act.check_limits_and_balance` |
| `proc.term_deposit_lifecycle#s1:Fund` | USES | `act.post_to_ledger` |
| `proc.term_deposit_lifecycle` | ACTIVITY | `proc.term_deposit_lifecycle#s2:Book` |
| `proc.term_deposit_lifecycle#s2:Book` | NEXT | `proc.term_deposit_lifecycle#s3:Accrue Interest` |
| `proc.term_deposit_lifecycle#s2:Book` | WRITES | `obj.term_deposit` |
| `proc.term_deposit_lifecycle` | ACTIVITY | `proc.term_deposit_lifecycle#s3:Accrue Interest` |
| `proc.term_deposit_lifecycle#s3:Accrue Interest` | NEXT | `proc.term_deposit_lifecycle#s4:Capture Maturity Instruction` |
| `proc.term_deposit_lifecycle` | ACTIVITY | `proc.term_deposit_lifecycle#s4:Capture Maturity Instruction` |
| `proc.term_deposit_lifecycle#s4:Capture Maturity Instruction` | NEXT | `proc.term_deposit_lifecycle#s5:Pay Out or Renew` |
| `proc.term_deposit_lifecycle#s4:Capture Maturity Instruction` | USES | `act.check_consent` |
| `proc.term_deposit_lifecycle#s4:Capture Maturity Instruction` | USES | `act.notify_customer` |
| `proc.term_deposit_lifecycle` | ACTIVITY | `proc.term_deposit_lifecycle#s5:Pay Out or Renew` |
| `proc.term_deposit_lifecycle#s5:Pay Out or Renew` | NEXT | `proc.term_deposit_lifecycle#s6:Close` |
| `proc.term_deposit_lifecycle#s5:Pay Out or Renew` | USES | `act.post_to_ledger` |
| `proc.term_deposit_lifecycle#s5:Pay Out or Renew` | WRITES | `obj.term_deposit` |
| `proc.term_deposit_lifecycle#s5:Pay Out or Renew` | WRITES | `obj.transaction` |
| `proc.term_deposit_lifecycle` | FINALIZE | `proc.term_deposit_lifecycle#s6:Close` |
| `proc.term_deposit_lifecycle#s6:Close` | WRITES | `obj.term_deposit` |
| `proc.term_deposit_lifecycle` | READS | `obj.account` |
| `proc.term_deposit_lifecycle` | READS | `obj.product` |
| `proc.term_deposit_lifecycle` | READS | `obj.customer` |
| `evt.inactivity_threshold` | TRIGGERS | `proc.dormancy_and_closure` |
| `evt.closure_requested` | TRIGGERS | `proc.dormancy_and_closure` |
| `proc.dormancy_and_closure` | PERFORMED_BY | `actor.service_agent` |
| `proc.dormancy_and_closure` | ESCALATES_TO | `actor.service_officer` |
| `proc.dormancy_and_closure` | ESCALATES_TO | `actor.compliance_officer` |
| `proc.dormancy_and_closure` | GOVERNED_BY | `pol.authentication_assurance` |
| `proc.dormancy_and_closure` | GOVERNED_BY | `pol.agent_guardrails` |
| `proc.dormancy_and_closure` | GOVERNED_BY | `pol.audit_evidence` |
| `proc.dormancy_and_closure` | START | `proc.dormancy_and_closure#s1:Receive Request or Detect Inactivity` |
| `proc.dormancy_and_closure#s1:Receive Request or Detect Inactivity` | NEXT | `proc.dormancy_and_closure#s2:Verify Customer` |
| `proc.dormancy_and_closure` | ACTIVITY | `proc.dormancy_and_closure#s2:Verify Customer` |
| `proc.dormancy_and_closure#s2:Verify Customer` | NEXT | `proc.dormancy_and_closure#s3:Clear Dues and Holds` |
| `proc.dormancy_and_closure#s2:Verify Customer` | USES | `act.authenticate_step_up` |
| `proc.dormancy_and_closure#s2:Verify Customer` | USES | `act.verify_identity` |
| `proc.dormancy_and_closure` | ACTIVITY | `proc.dormancy_and_closure#s3:Clear Dues and Holds` |
| `proc.dormancy_and_closure#s3:Clear Dues and Holds` | NEXT | `proc.dormancy_and_closure#s4:Retention Check` |
| `proc.dormancy_and_closure#s3:Clear Dues and Holds` | USES | `act.check_limits_and_balance` |
| `proc.dormancy_and_closure` | ACTIVITY | `proc.dormancy_and_closure#s4:Retention Check` |
| `proc.dormancy_and_closure#s4:Retention Check` | NEXT | `proc.dormancy_and_closure#s5:Settle Balance` |
| `proc.dormancy_and_closure` | ACTIVITY | `proc.dormancy_and_closure#s5:Settle Balance` |
| `proc.dormancy_and_closure#s5:Settle Balance` | NEXT | `proc.dormancy_and_closure#s6:Close Account` |
| `proc.dormancy_and_closure#s5:Settle Balance` | USES | `act.post_to_ledger` |
| `proc.dormancy_and_closure#s5:Settle Balance` | WRITES | `obj.transaction` |
| `proc.dormancy_and_closure` | ACTIVITY | `proc.dormancy_and_closure#s6:Close Account` |
| `proc.dormancy_and_closure#s6:Close Account` | NEXT | `proc.dormancy_and_closure#s7:Archive Records` |
| `proc.dormancy_and_closure#s6:Close Account` | WRITES | `obj.account` |
| `proc.dormancy_and_closure#s6:Close Account` | WRITES | `obj.card` |
| `proc.dormancy_and_closure#s6:Close Account` | WRITES | `obj.standing_instruction` |
| `proc.dormancy_and_closure` | FINALIZE | `proc.dormancy_and_closure#s7:Archive Records` |
| `proc.dormancy_and_closure#s7:Archive Records` | USES | `act.notify_customer` |
| `proc.dormancy_and_closure` | READS | `obj.account` |
| `proc.dormancy_and_closure` | READS | `obj.customer` |
| `proc.dormancy_and_closure` | READS | `obj.standing_instruction` |
| `evt.business_date_end` | TRIGGERS | `proc.daily_close_eod` |
| `proc.daily_close_eod` | PERFORMED_BY | `actor.operations_agent` |
| `proc.daily_close_eod` | ESCALATES_TO | `actor.operations_officer` |
| `proc.daily_close_eod` | ESCALATES_TO | `actor.finance_ops` |
| `proc.daily_close_eod` | GOVERNED_BY | `pol.audit_evidence` |
| `proc.daily_close_eod` | GOVERNED_BY | `pol.agent_guardrails` |
| `proc.daily_close_eod` | START | `proc.daily_close_eod#s1:Cut Off Transactions` |
| `proc.daily_close_eod#s1:Cut Off Transactions` | NEXT | `proc.daily_close_eod#s2:Accrue Interest` |
| `proc.daily_close_eod` | ACTIVITY | `proc.daily_close_eod#s2:Accrue Interest` |
| `proc.daily_close_eod#s2:Accrue Interest` | NEXT | `proc.daily_close_eod#s3:Post Fees` |
| `proc.daily_close_eod#s2:Accrue Interest` | USES | `act.post_to_ledger` |
| `proc.daily_close_eod#s2:Accrue Interest` | PERFORMED_BY | `actor.system_batch` |
| `proc.daily_close_eod` | ACTIVITY | `proc.daily_close_eod#s3:Post Fees` |
| `proc.daily_close_eod#s3:Post Fees` | NEXT | `proc.daily_close_eod#s4:Run EMI Debits` |
| `proc.daily_close_eod#s3:Post Fees` | USES | `act.post_to_ledger` |
| `proc.daily_close_eod#s3:Post Fees` | PERFORMED_BY | `actor.system_batch` |
| `proc.daily_close_eod` | ACTIVITY | `proc.daily_close_eod#s4:Run EMI Debits` |
| `proc.daily_close_eod#s4:Run EMI Debits` | NEXT | `proc.daily_close_eod#s5:Reconcile` |
| `proc.daily_close_eod#s4:Run EMI Debits` | USES | `act.post_to_ledger` |
| `proc.daily_close_eod#s4:Run EMI Debits` | PERFORMED_BY | `actor.system_batch` |
| `proc.daily_close_eod` | ACTIVITY | `proc.daily_close_eod#s5:Reconcile` |
| `proc.daily_close_eod#s5:Reconcile` | NEXT | `proc.daily_close_eod#s6:Generate Statements` |
| `proc.daily_close_eod#s5:Reconcile` | USES | `act.reconcile` |
| `proc.daily_close_eod#s5:Reconcile` | REQUIRES_APPROVAL_FROM | `actor.finance_ops` |
| `proc.daily_close_eod` | ACTIVITY | `proc.daily_close_eod#s6:Generate Statements` |
| `proc.daily_close_eod#s6:Generate Statements` | NEXT | `proc.daily_close_eod#s7:Produce Trial Balance` |
| `proc.daily_close_eod` | ACTIVITY | `proc.daily_close_eod#s7:Produce Trial Balance` |
| `proc.daily_close_eod#s7:Produce Trial Balance` | NEXT | `proc.daily_close_eod#s8:Open Next Business Date` |
| `proc.daily_close_eod` | FINALIZE | `proc.daily_close_eod#s8:Open Next Business Date` |
| `proc.daily_close_eod` | READS | `obj.account` |
| `proc.daily_close_eod` | READS | `obj.journal_entry` |
| `proc.daily_close_eod` | READS | `obj.repayment` |
| `proc.daily_close_eod` | READS | `obj.standing_instruction` |
| `evt.aml_alert_raised` | TRIGGERS | `proc.aml_alert_investigation` |
| `proc.aml_alert_investigation` | PERFORMED_BY | `actor.aml_agent` |
| `proc.aml_alert_investigation` | ESCALATES_TO | `actor.aml_investigator` |
| `proc.aml_alert_investigation` | ESCALATES_TO | `actor.mlro` |
| `proc.aml_alert_investigation` | GOVERNED_BY | `pol.agent_guardrails` |
| `proc.aml_alert_investigation` | GOVERNED_BY | `pol.approval_matrix` |
| `proc.aml_alert_investigation` | GOVERNED_BY | `pol.audit_evidence` |
| `proc.aml_alert_investigation` | START | `proc.aml_alert_investigation#s1:Triage` |
| `proc.aml_alert_investigation#s1:Triage` | NEXT | `proc.aml_alert_investigation#s2:Enrich` |
| `proc.aml_alert_investigation` | ACTIVITY | `proc.aml_alert_investigation#s2:Enrich` |
| `proc.aml_alert_investigation#s2:Enrich` | NEXT | `proc.aml_alert_investigation#s3:Investigate` |
| `proc.aml_alert_investigation#s2:Enrich` | USES | `act.build_customer_context` |
| `proc.aml_alert_investigation` | ACTIVITY | `proc.aml_alert_investigation#s3:Investigate` |
| `proc.aml_alert_investigation#s3:Investigate` | NEXT | `proc.aml_alert_investigation#s4:Decide` |
| `proc.aml_alert_investigation` | ACTIVITY | `proc.aml_alert_investigation#s4:Decide` |
| `proc.aml_alert_investigation#s4:Decide` | NEXT | `proc.aml_alert_investigation#s5:File STR` |
| `proc.aml_alert_investigation#s4:Decide` | USES | `act.route_to_approver` |
| `proc.aml_alert_investigation#s4:Decide` | REQUIRES_APPROVAL_FROM | `actor.aml_investigator` |
| `proc.aml_alert_investigation` | ACTIVITY | `proc.aml_alert_investigation#s5:File STR` |
| `proc.aml_alert_investigation#s5:File STR` | NEXT | `proc.aml_alert_investigation#s6:Close with Disposition` |
| `proc.aml_alert_investigation#s5:File STR` | USES | `act.route_to_approver` |
| `proc.aml_alert_investigation#s5:File STR` | REQUIRES_APPROVAL_FROM | `actor.mlro` |
| `proc.aml_alert_investigation` | FINALIZE | `proc.aml_alert_investigation#s6:Close with Disposition` |
| `proc.aml_alert_investigation#s6:Close with Disposition` | WRITES | `obj.alert` |
| `proc.aml_alert_investigation` | READS | `obj.alert` |
| `proc.aml_alert_investigation` | READS | `obj.customer` |
| `proc.aml_alert_investigation` | READS | `obj.household` |
| `proc.aml_alert_investigation` | READS | `obj.transaction` |
| `evt.reporting_period_end` | TRIGGERS | `proc.regulatory_reporting` |
| `proc.regulatory_reporting` | PERFORMED_BY | `actor.reporting_agent` |
| `proc.regulatory_reporting` | ESCALATES_TO | `actor.finance_ops` |
| `proc.regulatory_reporting` | ESCALATES_TO | `actor.compliance_officer` |
| `proc.regulatory_reporting` | GOVERNED_BY | `pol.approval_matrix` |
| `proc.regulatory_reporting` | GOVERNED_BY | `pol.audit_evidence` |
| `proc.regulatory_reporting` | GOVERNED_BY | `pol.agent_guardrails` |
| `proc.regulatory_reporting` | START | `proc.regulatory_reporting#s1:Extract` |
| `proc.regulatory_reporting#s1:Extract` | NEXT | `proc.regulatory_reporting#s2:Validate Data Quality` |
| `proc.regulatory_reporting` | ACTIVITY | `proc.regulatory_reporting#s2:Validate Data Quality` |
| `proc.regulatory_reporting#s2:Validate Data Quality` | NEXT | `proc.regulatory_reporting#s3:Reconcile to Ledger` |
| `proc.regulatory_reporting#s2:Validate Data Quality` | USES | `act.check_data_quality` |
| `proc.regulatory_reporting` | ACTIVITY | `proc.regulatory_reporting#s3:Reconcile to Ledger` |
| `proc.regulatory_reporting#s3:Reconcile to Ledger` | NEXT | `proc.regulatory_reporting#s4:Review` |
| `proc.regulatory_reporting#s3:Reconcile to Ledger` | USES | `act.reconcile` |
| `proc.regulatory_reporting` | ACTIVITY | `proc.regulatory_reporting#s4:Review` |
| `proc.regulatory_reporting#s4:Review` | NEXT | `proc.regulatory_reporting#s5:Submit` |
| `proc.regulatory_reporting#s4:Review` | USES | `act.route_to_approver` |
| `proc.regulatory_reporting#s4:Review` | REQUIRES_APPROVAL_FROM | `actor.finance_ops` |
| `proc.regulatory_reporting` | ACTIVITY | `proc.regulatory_reporting#s5:Submit` |
| `proc.regulatory_reporting#s5:Submit` | NEXT | `proc.regulatory_reporting#s6:File Acknowledgement` |
| `proc.regulatory_reporting#s5:Submit` | USES | `act.route_to_approver` |
| `proc.regulatory_reporting#s5:Submit` | REQUIRES_APPROVAL_FROM | `actor.compliance_officer` |
| `proc.regulatory_reporting` | FINALIZE | `proc.regulatory_reporting#s6:File Acknowledgement` |
| `proc.regulatory_reporting#s6:File Acknowledgement` | WRITES | `obj.regulatory_report` |
| `proc.regulatory_reporting` | READS | `obj.dataset` |
| `proc.regulatory_reporting` | READS | `obj.journal_entry` |
| `evt.agent_action_proposed` | TRIGGERS | `proc.agent_action_approval` |
| `proc.agent_action_approval` | PERFORMED_BY | `actor.governance_agent` |
| `proc.agent_action_approval` | ESCALATES_TO | `actor.compliance_officer` |
| `proc.agent_action_approval` | ESCALATES_TO | `actor.relationship_manager` |
| `proc.agent_action_approval` | GOVERNED_BY | `pol.agent_guardrails` |
| `proc.agent_action_approval` | GOVERNED_BY | `pol.approval_matrix` |
| `proc.agent_action_approval` | GOVERNED_BY | `pol.consent_privacy` |
| `proc.agent_action_approval` | GOVERNED_BY | `pol.audit_evidence` |
| `proc.agent_action_approval` | START | `proc.agent_action_approval#s1:Receive Proposal` |
| `proc.agent_action_approval#s1:Receive Proposal` | NEXT | `proc.agent_action_approval#s2:Check Policy` |
| `proc.agent_action_approval` | ACTIVITY | `proc.agent_action_approval#s2:Check Policy` |
| `proc.agent_action_approval#s2:Check Policy` | NEXT | `proc.agent_action_approval#s3:Check Consent` |
| `proc.agent_action_approval` | ACTIVITY | `proc.agent_action_approval#s3:Check Consent` |
| `proc.agent_action_approval#s3:Check Consent` | NEXT | `proc.agent_action_approval#s4:Assess Risk` |
| `proc.agent_action_approval#s3:Check Consent` | USES | `act.check_consent` |
| `proc.agent_action_approval` | ACTIVITY | `proc.agent_action_approval#s4:Assess Risk` |
| `proc.agent_action_approval#s4:Assess Risk` | NEXT | `proc.agent_action_approval#s5:Route to Approver` |
| `proc.agent_action_approval` | ACTIVITY | `proc.agent_action_approval#s5:Route to Approver` |
| `proc.agent_action_approval#s5:Route to Approver` | NEXT | `proc.agent_action_approval#s6:Approve or Reject` |
| `proc.agent_action_approval#s5:Route to Approver` | USES | `act.route_to_approver` |
| `proc.agent_action_approval` | ACTIVITY | `proc.agent_action_approval#s6:Approve or Reject` |
| `proc.agent_action_approval#s6:Approve or Reject` | NEXT | `proc.agent_action_approval#s7:Return Approval Token` |
| `proc.agent_action_approval#s6:Approve or Reject` | REQUIRES_APPROVAL_FROM | `actor.relationship_manager` |
| `proc.agent_action_approval` | ACTIVITY | `proc.agent_action_approval#s7:Return Approval Token` |
| `proc.agent_action_approval#s7:Return Approval Token` | NEXT | `proc.agent_action_approval#s8:Seal Evidence` |
| `proc.agent_action_approval` | FINALIZE | `proc.agent_action_approval#s8:Seal Evidence` |
| `proc.agent_action_approval#s8:Seal Evidence` | WRITES | `obj.approval_request` |
| `proc.agent_action_approval#s8:Seal Evidence` | WRITES | `obj.audit_event` |
| `proc.agent_action_approval` | READS | `obj.approval_request` |
| `proc.agent_action_approval` | READS | `obj.consent` |
| `proc.agent_action_approval` | READS | `obj.policy_rule` |
| `evt.model_change_proposed` | TRIGGERS | `proc.model_lifecycle` |
| `proc.model_lifecycle` | PERFORMED_BY | `actor.governance_agent` |
| `proc.model_lifecycle` | ESCALATES_TO | `actor.model_risk_officer` |
| `proc.model_lifecycle` | GOVERNED_BY | `pol.approval_matrix` |
| `proc.model_lifecycle` | GOVERNED_BY | `pol.audit_evidence` |
| `proc.model_lifecycle` | GOVERNED_BY | `pol.agent_guardrails` |
| `proc.model_lifecycle` | START | `proc.model_lifecycle#s1:Propose` |
| `proc.model_lifecycle#s1:Propose` | NEXT | `proc.model_lifecycle#s2:Validate` |
| `proc.model_lifecycle#s1:Propose` | WRITES | `obj.model` |
| `proc.model_lifecycle` | ACTIVITY | `proc.model_lifecycle#s2:Validate` |
| `proc.model_lifecycle#s2:Validate` | NEXT | `proc.model_lifecycle#s3:Approve` |
| `proc.model_lifecycle` | ACTIVITY | `proc.model_lifecycle#s3:Approve` |
| `proc.model_lifecycle#s3:Approve` | NEXT | `proc.model_lifecycle#s4:Deploy` |
| `proc.model_lifecycle#s3:Approve` | USES | `act.route_to_approver` |
| `proc.model_lifecycle#s3:Approve` | REQUIRES_APPROVAL_FROM | `actor.model_risk_officer` |
| `proc.model_lifecycle` | ACTIVITY | `proc.model_lifecycle#s4:Deploy` |
| `proc.model_lifecycle#s4:Deploy` | NEXT | `proc.model_lifecycle#s5:Monitor` |
| `proc.model_lifecycle#s4:Deploy` | WRITES | `obj.model` |
| `proc.model_lifecycle` | ACTIVITY | `proc.model_lifecycle#s5:Monitor` |
| `proc.model_lifecycle#s5:Monitor` | NEXT | `proc.model_lifecycle#s6:Retire` |
| `proc.model_lifecycle` | FINALIZE | `proc.model_lifecycle#s6:Retire` |
| `proc.model_lifecycle#s6:Retire` | WRITES | `obj.model` |
| `proc.model_lifecycle` | READS | `obj.model` |
| `proc.model_lifecycle` | READS | `obj.dataset` |
| `evt.dsr_received` | TRIGGERS | `proc.data_subject_request` |
| `proc.data_subject_request` | PERFORMED_BY | `actor.data_agent` |
| `proc.data_subject_request` | ESCALATES_TO | `actor.privacy_officer` |
| `proc.data_subject_request` | GOVERNED_BY | `pol.consent_privacy` |
| `proc.data_subject_request` | GOVERNED_BY | `pol.agent_guardrails` |
| `proc.data_subject_request` | GOVERNED_BY | `pol.audit_evidence` |
| `proc.data_subject_request` | START | `proc.data_subject_request#s1:Receive Request` |
| `proc.data_subject_request#s1:Receive Request` | NEXT | `proc.data_subject_request#s2:Verify Identity` |
| `proc.data_subject_request#s1:Receive Request` | WRITES | `obj.data_subject_request` |
| `proc.data_subject_request` | ACTIVITY | `proc.data_subject_request#s2:Verify Identity` |
| `proc.data_subject_request#s2:Verify Identity` | NEXT | `proc.data_subject_request#s3:Locate Data via Lineage` |
| `proc.data_subject_request#s2:Verify Identity` | USES | `act.verify_identity` |
| `proc.data_subject_request` | ACTIVITY | `proc.data_subject_request#s3:Locate Data via Lineage` |
| `proc.data_subject_request#s3:Locate Data via Lineage` | NEXT | `proc.data_subject_request#s4:Assess Legal Basis and Retention Holds` |
| `proc.data_subject_request` | ACTIVITY | `proc.data_subject_request#s4:Assess Legal Basis and Retention Holds` |
| `proc.data_subject_request#s4:Assess Legal Basis and Retention Holds` | NEXT | `proc.data_subject_request#s5:Apply` |
| `proc.data_subject_request#s4:Assess Legal Basis and Retention Holds` | USES | `act.route_to_approver` |
| `proc.data_subject_request#s4:Assess Legal Basis and Retention Holds` | REQUIRES_APPROVAL_FROM | `actor.privacy_officer` |
| `proc.data_subject_request` | ACTIVITY | `proc.data_subject_request#s5:Apply` |
| `proc.data_subject_request#s5:Apply` | NEXT | `proc.data_subject_request#s6:Confirm to Customer` |
| `proc.data_subject_request#s5:Apply` | WRITES | `obj.dataset` |
| `proc.data_subject_request` | FINALIZE | `proc.data_subject_request#s6:Confirm to Customer` |
| `proc.data_subject_request#s6:Confirm to Customer` | USES | `act.notify_customer` |
| `proc.data_subject_request` | READS | `obj.dataset` |
| `proc.data_subject_request` | READS | `obj.customer` |
| `proc.data_subject_request` | READS | `obj.consent` |
| `evt.insurance_lead` | TRIGGERS | `proc.insurance_sale` |
| `proc.insurance_sale` | PERFORMED_BY | `actor.insurance_agent` |
| `proc.insurance_sale` | ESCALATES_TO | `actor.licensed_advisor` |
| `proc.insurance_sale` | ESCALATES_TO | `actor.relationship_manager` |
| `proc.insurance_sale` | GOVERNED_BY | `pol.consent_privacy` |
| `proc.insurance_sale` | GOVERNED_BY | `pol.agent_guardrails` |
| `proc.insurance_sale` | GOVERNED_BY | `pol.approval_matrix` |
| `proc.insurance_sale` | GOVERNED_BY | `pol.audit_evidence` |
| `proc.insurance_sale` | START | `proc.insurance_sale#s1:Needs Analysis` |
| `proc.insurance_sale#s1:Needs Analysis` | NEXT | `proc.insurance_sale#s2:Quote` |
| `proc.insurance_sale#s1:Needs Analysis` | USES | `act.build_customer_context` |
| `proc.insurance_sale#s1:Needs Analysis` | USES | `act.check_eligibility_suitability` |
| `proc.insurance_sale#s1:Needs Analysis` | REQUIRES_APPROVAL_FROM | `actor.licensed_advisor` |
| `proc.insurance_sale` | ACTIVITY | `proc.insurance_sale#s2:Quote` |
| `proc.insurance_sale#s2:Quote` | NEXT | `proc.insurance_sale#s3:Proposal and Consent` |
| `proc.insurance_sale#s2:Quote` | WRITES | `obj.insurance_quote` |
| `proc.insurance_sale` | ACTIVITY | `proc.insurance_sale#s3:Proposal and Consent` |
| `proc.insurance_sale#s3:Proposal and Consent` | NEXT | `proc.insurance_sale#s4:Underwrite` |
| `proc.insurance_sale#s3:Proposal and Consent` | USES | `act.check_consent` |
| `proc.insurance_sale#s3:Proposal and Consent` | USES | `act.collect_documents` |
| `proc.insurance_sale` | ACTIVITY | `proc.insurance_sale#s4:Underwrite` |
| `proc.insurance_sale#s4:Underwrite` | NEXT | `proc.insurance_sale#s5:Issue Policy` |
| `proc.insurance_sale#s4:Underwrite` | PERFORMED_BY | `actor.insurer` |
| `proc.insurance_sale` | ACTIVITY | `proc.insurance_sale#s5:Issue Policy` |
| `proc.insurance_sale#s5:Issue Policy` | NEXT | `proc.insurance_sale#s6:Set Up Premium Payment` |
| `proc.insurance_sale#s5:Issue Policy` | WRITES | `obj.insurance_policy` |
| `proc.insurance_sale` | ACTIVITY | `proc.insurance_sale#s6:Set Up Premium Payment` |
| `proc.insurance_sale#s6:Set Up Premium Payment` | NEXT | `proc.insurance_sale#s7:Accrue Commission` |
| `proc.insurance_sale#s6:Set Up Premium Payment` | USES | `act.authenticate_step_up` |
| `proc.insurance_sale#s6:Set Up Premium Payment` | WRITES | `obj.premium` |
| `proc.insurance_sale#s6:Set Up Premium Payment` | WRITES | `obj.standing_instruction` |
| `proc.insurance_sale` | FINALIZE | `proc.insurance_sale#s7:Accrue Commission` |
| `proc.insurance_sale` | READS | `obj.customer` |
| `proc.insurance_sale` | READS | `obj.product` |
| `proc.insurance_sale` | READS | `obj.insurer` |
| `proc.insurance_sale` | READS | `obj.consent` |
| `evt.claim_intimated` | TRIGGERS | `proc.claim_assistance` |
| `proc.claim_assistance` | PERFORMED_BY | `actor.insurance_agent` |
| `proc.claim_assistance` | ESCALATES_TO | `actor.service_officer` |
| `proc.claim_assistance` | ESCALATES_TO | `actor.licensed_advisor` |
| `proc.claim_assistance` | GOVERNED_BY | `pol.consent_privacy` |
| `proc.claim_assistance` | GOVERNED_BY | `pol.agent_guardrails` |
| `proc.claim_assistance` | GOVERNED_BY | `pol.audit_evidence` |
| `proc.claim_assistance` | START | `proc.claim_assistance#s1:Verify Policy` |
| `proc.claim_assistance#s1:Verify Policy` | NEXT | `proc.claim_assistance#s2:Collect Documents` |
| `proc.claim_assistance#s1:Verify Policy` | USES | `act.verify_identity` |
| `proc.claim_assistance` | ACTIVITY | `proc.claim_assistance#s2:Collect Documents` |
| `proc.claim_assistance#s2:Collect Documents` | NEXT | `proc.claim_assistance#s3:Submit to Insurer` |
| `proc.claim_assistance#s2:Collect Documents` | USES | `act.collect_documents` |
| `proc.claim_assistance#s2:Collect Documents` | WRITES | `obj.claim` |
| `proc.claim_assistance` | ACTIVITY | `proc.claim_assistance#s3:Submit to Insurer` |
| `proc.claim_assistance#s3:Submit to Insurer` | NEXT | `proc.claim_assistance#s4:Track` |
| `proc.claim_assistance` | ACTIVITY | `proc.claim_assistance#s4:Track` |
| `proc.claim_assistance#s4:Track` | NEXT | `proc.claim_assistance#s5:Settle` |
| `proc.claim_assistance#s4:Track` | USES | `act.open_case` |
| `proc.claim_assistance` | ACTIVITY | `proc.claim_assistance#s5:Settle` |
| `proc.claim_assistance#s5:Settle` | NEXT | `proc.claim_assistance#s6:Close` |
| `proc.claim_assistance#s5:Settle` | USES | `act.post_to_ledger` |
| `proc.claim_assistance#s5:Settle` | PERFORMED_BY | `actor.insurer` |
| `proc.claim_assistance#s5:Settle` | WRITES | `obj.claim` |
| `proc.claim_assistance#s5:Settle` | WRITES | `obj.transaction` |
| `proc.claim_assistance` | FINALIZE | `proc.claim_assistance#s6:Close` |
| `proc.claim_assistance#s6:Close` | USES | `act.notify_customer` |
| `proc.claim_assistance` | READS | `obj.insurance_policy` |
| `proc.claim_assistance` | READS | `obj.claim` |
| `proc.claim_assistance` | READS | `obj.customer` |
| `evt.new_data_source` | TRIGGERS | `proc.data_product_publication` |
| `proc.data_product_publication` | PERFORMED_BY | `actor.data_agent` |
| `proc.data_product_publication` | ESCALATES_TO | `actor.data_steward` |
| `proc.data_product_publication` | GOVERNED_BY | `pol.consent_privacy` |
| `proc.data_product_publication` | GOVERNED_BY | `pol.audit_evidence` |
| `proc.data_product_publication` | GOVERNED_BY | `pol.approval_matrix` |
| `proc.data_product_publication` | START | `proc.data_product_publication#s1:Register Source` |
| `proc.data_product_publication#s1:Register Source` | NEXT | `proc.data_product_publication#s2:Ingest` |
| `proc.data_product_publication#s1:Register Source` | WRITES | `obj.dataset` |
| `proc.data_product_publication` | ACTIVITY | `proc.data_product_publication#s2:Ingest` |
| `proc.data_product_publication#s2:Ingest` | NEXT | `proc.data_product_publication#s3:Check Data Quality` |
| `proc.data_product_publication` | ACTIVITY | `proc.data_product_publication#s3:Check Data Quality` |
| `proc.data_product_publication#s3:Check Data Quality` | NEXT | `proc.data_product_publication#s4:Classify PII` |
| `proc.data_product_publication#s3:Check Data Quality` | USES | `act.check_data_quality` |
| `proc.data_product_publication` | ACTIVITY | `proc.data_product_publication#s4:Classify PII` |
| `proc.data_product_publication#s4:Classify PII` | NEXT | `proc.data_product_publication#s5:Transform` |
| `proc.data_product_publication#s4:Classify PII` | WRITES | `obj.dataset` |
| `proc.data_product_publication` | ACTIVITY | `proc.data_product_publication#s5:Transform` |
| `proc.data_product_publication#s5:Transform` | NEXT | `proc.data_product_publication#s6:Publish` |
| `proc.data_product_publication` | ACTIVITY | `proc.data_product_publication#s6:Publish` |
| `proc.data_product_publication#s6:Publish` | NEXT | `proc.data_product_publication#s7:Grant Access` |
| `proc.data_product_publication#s6:Publish` | WRITES | `obj.dataset` |
| `proc.data_product_publication` | ACTIVITY | `proc.data_product_publication#s7:Grant Access` |
| `proc.data_product_publication#s7:Grant Access` | NEXT | `proc.data_product_publication#s8:Record Lineage` |
| `proc.data_product_publication#s7:Grant Access` | USES | `act.route_to_approver` |
| `proc.data_product_publication#s7:Grant Access` | REQUIRES_APPROVAL_FROM | `actor.data_steward` |
| `proc.data_product_publication` | FINALIZE | `proc.data_product_publication#s8:Record Lineage` |
| `proc.data_product_publication#s8:Record Lineage` | WRITES | `obj.dataset` |
| `proc.data_product_publication` | READS | `obj.dataset` |
| `act.verify_identity` | READS | `obj.customer` |
| `act.verify_identity` | READS | `obj.document` |
| `act.verify_identity` | WRITES | `obj.kyc_record` |
| `act.verify_identity` | GOVERNED_BY | `pol.consent_privacy` |
| `act.verify_identity` | GOVERNED_BY | `pol.authentication_assurance` |
| `act.verify_identity` | GOVERNED_BY | `pol.audit_evidence` |
| `act.verify_identity` | REQUIRES_APPROVAL_FROM | `actor.compliance_officer` |
| `act.screen_sanctions_pep` | READS | `obj.customer` |
| `act.screen_sanctions_pep` | READS | `obj.kyc_record` |
| `act.screen_sanctions_pep` | WRITES | `obj.alert` |
| `act.screen_sanctions_pep` | WRITES | `obj.kyc_record` |
| `act.screen_sanctions_pep` | GOVERNED_BY | `pol.agent_guardrails` |
| `act.screen_sanctions_pep` | GOVERNED_BY | `pol.audit_evidence` |
| `act.screen_sanctions_pep` | GOVERNED_BY | `pol.approval_matrix` |
| `act.screen_sanctions_pep` | REQUIRES_APPROVAL_FROM | `actor.compliance_officer` |
| `act.risk_rate_customer` | READS | `obj.customer` |
| `act.risk_rate_customer` | READS | `obj.risk_factor` |
| `act.risk_rate_customer` | READS | `obj.kyc_record` |
| `act.risk_rate_customer` | WRITES | `obj.kyc_record` |
| `act.risk_rate_customer` | WRITES | `obj.risk_factor` |
| `act.risk_rate_customer` | GOVERNED_BY | `pol.approval_matrix` |
| `act.risk_rate_customer` | GOVERNED_BY | `pol.audit_evidence` |
| `act.risk_rate_customer` | REQUIRES_APPROVAL_FROM | `actor.compliance_officer` |
| `act.check_consent` | READS | `obj.customer` |
| `act.check_consent` | READS | `obj.consent` |
| `act.check_consent` | GOVERNED_BY | `pol.consent_privacy` |
| `act.check_consent` | GOVERNED_BY | `pol.audit_evidence` |
| `act.authenticate_step_up` | READS | `obj.customer` |
| `act.authenticate_step_up` | READS | `obj.payment` |
| `act.authenticate_step_up` | WRITES | `obj.payment` |
| `act.authenticate_step_up` | GOVERNED_BY | `pol.authentication_assurance` |
| `act.authenticate_step_up` | GOVERNED_BY | `pol.audit_evidence` |
| `act.collect_documents` | READS | `obj.document` |
| `act.collect_documents` | WRITES | `obj.document` |
| `act.collect_documents` | GOVERNED_BY | `pol.consent_privacy` |
| `act.collect_documents` | GOVERNED_BY | `pol.audit_evidence` |
| `act.collect_documents` | REQUIRES_APPROVAL_FROM | `actor.service_officer` |
| `act.pull_credit_bureau` | READS | `obj.customer` |
| `act.pull_credit_bureau` | READS | `obj.consent` |
| `act.pull_credit_bureau` | WRITES | `obj.credit_report` |
| `act.pull_credit_bureau` | GOVERNED_BY | `pol.consent_privacy` |
| `act.pull_credit_bureau` | GOVERNED_BY | `pol.audit_evidence` |
| `act.check_limits_and_balance` | READS | `obj.account` |
| `act.check_limits_and_balance` | READS | `obj.card` |
| `act.check_limits_and_balance` | GOVERNED_BY | `pol.approval_matrix` |
| `act.check_limits_and_balance` | GOVERNED_BY | `pol.audit_evidence` |
| `act.score_transaction_risk` | READS | `obj.payment` |
| `act.score_transaction_risk` | READS | `obj.customer` |
| `act.score_transaction_risk` | READS | `obj.beneficiary` |
| `act.score_transaction_risk` | WRITES | `obj.payment` |
| `act.score_transaction_risk` | GOVERNED_BY | `pol.approval_matrix` |
| `act.score_transaction_risk` | GOVERNED_BY | `pol.agent_guardrails` |
| `act.score_transaction_risk` | GOVERNED_BY | `pol.audit_evidence` |
| `act.score_transaction_risk` | REQUIRES_APPROVAL_FROM | `actor.fraud_analyst` |
| `act.place_balance_hold` | READS | `obj.account` |
| `act.place_balance_hold` | WRITES | `obj.hold` |
| `act.place_balance_hold` | GOVERNED_BY | `pol.audit_evidence` |
| `act.post_to_ledger` | READS | `obj.account` |
| `act.post_to_ledger` | READS | `obj.journal_entry` |
| `act.post_to_ledger` | WRITES | `obj.journal_entry` |
| `act.post_to_ledger` | WRITES | `obj.transaction` |
| `act.post_to_ledger` | GOVERNED_BY | `pol.audit_evidence` |
| `act.post_to_ledger` | REQUIRES_APPROVAL_FROM | `actor.finance_ops` |
| `act.notify_customer` | READS | `obj.customer` |
| `act.notify_customer` | READS | `obj.channel` |
| `act.notify_customer` | WRITES | `obj.interaction` |
| `act.notify_customer` | GOVERNED_BY | `pol.consent_privacy` |
| `act.notify_customer` | GOVERNED_BY | `pol.audit_evidence` |
| `act.route_to_approver` | READS | `obj.approval_request` |
| `act.route_to_approver` | WRITES | `obj.approval_request` |
| `act.route_to_approver` | GOVERNED_BY | `pol.approval_matrix` |
| `act.route_to_approver` | GOVERNED_BY | `pol.agent_guardrails` |
| `act.route_to_approver` | GOVERNED_BY | `pol.audit_evidence` |
| `act.open_case` | READS | `obj.customer` |
| `act.open_case` | READS | `obj.interaction` |
| `act.open_case` | WRITES | `obj.case` |
| `act.open_case` | GOVERNED_BY | `pol.agent_guardrails` |
| `act.open_case` | GOVERNED_BY | `pol.audit_evidence` |
| `act.build_customer_context` | READS | `obj.customer` |
| `act.build_customer_context` | READS | `obj.account` |
| `act.build_customer_context` | READS | `obj.interaction` |
| `act.build_customer_context` | READS | `obj.case` |
| `act.build_customer_context` | READS | `obj.segment` |
| `act.build_customer_context` | READS | `obj.consent` |
| `act.build_customer_context` | READS | `obj.lead_opportunity` |
| `act.build_customer_context` | GOVERNED_BY | `pol.consent_privacy` |
| `act.build_customer_context` | GOVERNED_BY | `pol.agent_guardrails` |
| `act.build_customer_context` | GOVERNED_BY | `pol.audit_evidence` |
| `act.check_eligibility_suitability` | READS | `obj.customer` |
| `act.check_eligibility_suitability` | READS | `obj.product` |
| `act.check_eligibility_suitability` | READS | `obj.offer` |
| `act.check_eligibility_suitability` | GOVERNED_BY | `pol.agent_guardrails` |
| `act.check_eligibility_suitability` | GOVERNED_BY | `pol.approval_matrix` |
| `act.check_eligibility_suitability` | GOVERNED_BY | `pol.audit_evidence` |
| `act.check_eligibility_suitability` | REQUIRES_APPROVAL_FROM | `actor.relationship_manager` |
| `act.validate_beneficiary` | READS | `obj.beneficiary` |
| `act.validate_beneficiary` | WRITES | `obj.beneficiary` |
| `act.validate_beneficiary` | GOVERNED_BY | `pol.agent_guardrails` |
| `act.validate_beneficiary` | GOVERNED_BY | `pol.audit_evidence` |
| `act.validate_beneficiary` | REQUIRES_APPROVAL_FROM | `actor.fraud_analyst` |
| `act.reconcile` | READS | `obj.journal_entry` |
| `act.reconcile` | WRITES | `obj.journal_entry` |
| `act.reconcile` | GOVERNED_BY | `pol.audit_evidence` |
| `act.reconcile` | REQUIRES_APPROVAL_FROM | `actor.finance_ops` |
| `act.check_data_quality` | READS | `obj.dataset` |
| `act.check_data_quality` | WRITES | `obj.dataset` |
| `act.check_data_quality` | GOVERNED_BY | `pol.audit_evidence` |
| `act.check_data_quality` | REQUIRES_APPROVAL_FROM | `actor.data_steward` |
| `act.write_back_outcome` | READS | `obj.interaction` |
| `act.write_back_outcome` | WRITES | `obj.interaction` |
| `act.write_back_outcome` | WRITES | `obj.lead_opportunity` |
| `act.write_back_outcome` | WRITES | `obj.case` |
| `act.write_back_outcome` | GOVERNED_BY | `pol.audit_evidence` |
| `obj.customer` | HOLDS | `obj.account` |
| `obj.customer` | MEMBER_OF | `obj.segment` |
| `obj.customer` | PART_OF | `obj.household` |
| `obj.customer` | MANAGED_BY | `obj.relationship_manager` |
| `obj.customer` | GRANTED | `obj.consent` |
| `obj.customer` | HAS_KYC | `obj.kyc_record` |
| `obj.customer` | HAS_RISK | `obj.risk_factor` |
| `obj.customer` | HAS_INTERACTION | `obj.interaction` |
| `obj.household` | GROUPS | `obj.customer` |
| `obj.segment` | CONTAINS | `obj.customer` |
| `obj.segment` | TARGETED_BY | `obj.campaign` |
| `obj.consent` | GIVEN_BY | `obj.customer` |
| `obj.kyc_record` | VERIFIES | `obj.customer` |
| `obj.kyc_record` | BASED_ON | `obj.document` |
| `obj.kyc_record` | SCORED_BY | `obj.risk_factor` |
| `obj.risk_factor` | CONTRIBUTES_TO | `obj.kyc_record` |
| `obj.risk_factor` | RAISES | `obj.alert` |
| `obj.document` | EVIDENCES | `obj.kyc_record` |
| `obj.document` | SUPPORTS | `obj.loan_application` |
| `obj.document` | SUPPORTS | `obj.claim` |
| `obj.account` | OWNED_BY | `obj.customer` |
| `obj.account` | GOVERNED_BY_PRODUCT | `obj.product` |
| `obj.account` | HAS | `obj.card` |
| `obj.account` | HAS | `obj.transaction` |
| `obj.account` | HAS | `obj.hold` |
| `obj.account` | HAS | `obj.standing_instruction` |
| `obj.card` | LINKED_TO | `obj.account` |
| `obj.card` | OWNED_BY | `obj.customer` |
| `obj.card` | AUTHORISES | `obj.transaction` |
| `obj.beneficiary` | SAVED_BY | `obj.customer` |
| `obj.beneficiary` | RECEIVES | `obj.payment` |
| `obj.transaction` | POSTED_AS | `obj.journal_entry` |
| `obj.transaction` | ON | `obj.account` |
| `obj.payment` | PAYS | `obj.beneficiary` |
| `obj.payment` | DEBITS | `obj.account` |
| `obj.payment` | CREATES | `obj.transaction` |
| `obj.payment` | RESERVES | `obj.hold` |
| `obj.payment` | DECIDED_BY | `obj.model` |
| `obj.hold` | RESERVES_FUNDS_ON | `obj.account` |
| `obj.journal_entry` | POSTS_TO | `obj.account` |
| `obj.journal_entry` | BELONGS_TO_PERIOD | `obj.regulatory_report` |
| `obj.standing_instruction` | DEBITS | `obj.account` |
| `obj.standing_instruction` | PAYS | `obj.beneficiary` |
| `obj.term_deposit` | HELD_IN | `obj.account` |
| `obj.term_deposit` | PRICED_BY | `obj.product` |
| `obj.loan_application` | SUBMITTED_BY | `obj.customer` |
| `obj.loan_application` | HAS | `obj.credit_report` |
| `obj.loan_application` | SECURED_BY | `obj.collateral` |
| `obj.loan_application` | BECOMES | `obj.loan` |
| `obj.loan_application` | STARTED_FROM | `obj.lead_opportunity` |
| `obj.credit_report` | PULLED_UNDER | `obj.consent` |
| `obj.collateral` | SECURES | `obj.loan_application` |
| `obj.loan` | OWED_BY | `obj.customer` |
| `obj.loan` | REPAID_BY | `obj.repayment` |
| `obj.loan` | MAY_HAVE | `obj.collections_case` |
| `obj.repayment` | INSTALMENT_OF | `obj.loan` |
| `obj.repayment` | RECEIVED_AS | `obj.transaction` |
| `obj.collections_case` | CHASES | `obj.loan` |
| `obj.collections_case` | TRACKED_AS | `obj.case` |
| `obj.insurance_quote` | FOR | `obj.customer` |
| `obj.insurance_quote` | BECOMES | `obj.insurance_policy` |
| `obj.insurance_policy` | HELD_BY | `obj.customer` |
| `obj.insurance_policy` | ISSUED_BY | `obj.insurer` |
| `obj.insurance_policy` | PAID_BY | `obj.premium` |
| `obj.insurance_policy` | CLAIMED_VIA | `obj.claim` |
| `obj.premium` | PAYS_FOR | `obj.insurance_policy` |
| `obj.claim` | AGAINST | `obj.insurance_policy` |
| `obj.claim` | SUPPORTED_BY | `obj.document` |
| `obj.insurer` | UNDERWRITES | `obj.insurance_policy` |
| `obj.product` | PROMOTED_BY | `obj.offer` |
| `obj.product` | HELD_AS | `obj.account` |
| `obj.offer` | FOR | `obj.product` |
| `obj.offer` | PART_OF | `obj.campaign` |
| `obj.offer` | MADE_TO | `obj.customer` |
| `obj.campaign` | TARGETS | `obj.segment` |
| `obj.campaign` | PROMOTES | `obj.offer` |
| `obj.channel` | CARRIES | `obj.interaction` |
| `obj.interaction` | WITH | `obj.customer` |
| `obj.interaction` | ON | `obj.channel` |
| `obj.interaction` | MAY_CREATE | `obj.case` |
| `obj.lead_opportunity` | FOR | `obj.customer` |
| `obj.lead_opportunity` | ABOUT | `obj.product` |
| `obj.lead_opportunity` | CONVERTS_TO | `obj.loan_application` |
| `obj.relationship_manager` | MANAGES | `obj.customer` |
| `obj.case` | RAISED_BY | `obj.customer` |
| `obj.case` | OWNED_BY | `obj.relationship_manager` |
| `obj.case` | HAS | `obj.interaction` |
| `obj.dispute` | DISPUTES | `obj.transaction` |
| `obj.dispute` | TRACKED_AS | `obj.case` |
| `obj.alert` | ABOUT | `obj.customer` |
| `obj.alert` | TRIGGERED_BY | `obj.transaction` |
| `obj.approval_request` | DECIDED_BY | `obj.relationship_manager` |
| `obj.policy_rule` | GOVERNS | `obj.approval_request` |
| `obj.model` | SCORES | `obj.customer` |
| `obj.audit_event` | RECORDS | `obj.approval_request` |
| `obj.agent_delegation` | GRANTED_BY | `obj.customer` |
| `obj.dataset` | FEEDS | `obj.regulatory_report` |
| `obj.dataset` | DERIVED_FROM | `obj.dataset` |
| `obj.regulatory_report` | BUILT_FROM | `obj.dataset` |
| `obj.data_subject_request` | MADE_BY | `obj.customer` |
