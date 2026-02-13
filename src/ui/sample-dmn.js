/**
 * Sample DMN XML for the "Try it" demo.
 */
export const SAMPLE_DMN = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/"
             xmlns:dmndi="https://www.omg.org/spec/DMN/20191111/DMNDI/"
             xmlns:dc="http://www.omg.org/spec/DMN/20180521/DC/"
             id="definitions_sample"
             name="Loan Eligibility"
             namespace="http://camunda.org/schema/1.0/dmn">

  <decision id="decision_eligibility" name="Loan Eligibility">
    <decisionTable id="dt_eligibility" hitPolicy="FIRST">
      <input id="input_age" label="Applicant Age">
        <inputExpression id="ie_age" typeRef="integer">
          <text>age</text>
        </inputExpression>
      </input>
      <input id="input_income" label="Annual Income">
        <inputExpression id="ie_income" typeRef="double">
          <text>income</text>
        </inputExpression>
      </input>
      <input id="input_employed" label="Employed">
        <inputExpression id="ie_employed" typeRef="boolean">
          <text>employed</text>
        </inputExpression>
      </input>
      <output id="output_eligible" label="Eligible" name="eligible" typeRef="boolean" />
      <output id="output_reason" label="Reason" name="reason" typeRef="string" />

      <rule id="rule_too_young">
        <inputEntry id="ie_r1_age"><text><![CDATA[< 18]]></text></inputEntry>
        <inputEntry id="ie_r1_income"><text>-</text></inputEntry>
        <inputEntry id="ie_r1_employed"><text>-</text></inputEntry>
        <outputEntry id="oe_r1_eligible"><text>false</text></outputEntry>
        <outputEntry id="oe_r1_reason"><text>"Applicant must be 18 or older"</text></outputEntry>
      </rule>
      <rule id="rule_not_employed">
        <inputEntry id="ie_r2_age"><text><![CDATA[>= 18]]></text></inputEntry>
        <inputEntry id="ie_r2_income"><text>-</text></inputEntry>
        <inputEntry id="ie_r2_employed"><text>false</text></inputEntry>
        <outputEntry id="oe_r2_eligible"><text>false</text></outputEntry>
        <outputEntry id="oe_r2_reason"><text>"Applicant must be employed"</text></outputEntry>
      </rule>
      <rule id="rule_low_income">
        <inputEntry id="ie_r3_age"><text><![CDATA[>= 18]]></text></inputEntry>
        <inputEntry id="ie_r3_income"><text><![CDATA[< 25000]]></text></inputEntry>
        <inputEntry id="ie_r3_employed"><text>true</text></inputEntry>
        <outputEntry id="oe_r3_eligible"><text>false</text></outputEntry>
        <outputEntry id="oe_r3_reason"><text>"Income below minimum threshold"</text></outputEntry>
      </rule>
      <rule id="rule_approved">
        <inputEntry id="ie_r4_age"><text><![CDATA[>= 18]]></text></inputEntry>
        <inputEntry id="ie_r4_income"><text><![CDATA[>= 25000]]></text></inputEntry>
        <inputEntry id="ie_r4_employed"><text>true</text></inputEntry>
        <outputEntry id="oe_r4_eligible"><text>true</text></outputEntry>
        <outputEntry id="oe_r4_reason"><text>"Approved"</text></outputEntry>
      </rule>
    </decisionTable>
  </decision>
</definitions>`;
