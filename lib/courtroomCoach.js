/**
 * Courtroom Coach — "What Do I Say in Court?"
 * Pro Se Legal Platform — Stand With Meg
 *
 * This module powers the Courtroom Coach feature.
 * It uses Meg's 12-years-of-court-experience knowledge base
 * combined with GovInfo + CourtListener to give users
 * EXACT scripts for what to say in court.
 */

// ─── SITUATION CATEGORIES ─────────────────────────────────────────────────────

export const COURT_SITUATIONS = {
  opening_statement: {
    label: "Opening Statement",
    description: "What to say at the start of your hearing or trial",
    icon: "🎤"
  },
  objection: {
    label: "Making an Objection",
    description: "How to object to evidence or testimony",
    icon: "✋"
  },
  cross_examination: {
    label: "Cross-Examining a Witness",
    description: "How to question the other side's witnesses",
    icon: "❓"
  },
  affirmative_defense: {
    label: "Raising an Affirmative Defense",
    description: "How to present your defenses to the court",
    icon: "🛡️"
  },
  responding_to_motion: {
    label: "Responding to a Motion",
    description: "What to say when the other side files a motion",
    icon: "📋"
  },
  addressing_judge: {
    label: "Addressing the Judge",
    description: "How to speak to the judge correctly",
    icon: "⚖️"
  },
  custody_hearing: {
    label: "Custody Hearing",
    description: "What to say at a custody or visitation hearing",
    icon: "👨‍👩‍👧"
  },
  dcf_hearing: {
    label: "DCF / Child Welfare Hearing",
    description: "What to say when DCF or CPS is involved",
    icon: "🏛️"
  },
  contempt_hearing: {
    label: "Contempt Hearing",
    description: "What to say if someone violated a court order",
    icon: "⚠️"
  },
  emergency_motion: {
    label: "Emergency Motion Hearing",
    description: "What to say in an emergency/TRO hearing",
    icon: "🚨"
  },
  closing_argument: {
    label: "Closing Argument",
    description: "How to wrap up your case powerfully",
    icon: "🔚"
  },
  summary_judgment: {
    label: "Summary Judgment Hearing",
    description: "What to say at a summary judgment hearing",
    icon: "📜"
  }
};

// ─── EXACT SCRIPTS BY SITUATION ───────────────────────────────────────────────

export const COURT_SCRIPTS = {

  addressing_judge: {
    title: "How to Address the Judge",
    rules: [
      "Always say 'Your Honor' — never 'Judge Smith' or 'Sir/Ma'am' alone",
      "Stand when speaking unless told otherwise",
      "Never interrupt the judge",
      "Say 'May I be heard, Your Honor?' before speaking",
      "Never argue with the judge — make your record and move on"
    ],
    scripts: [
      {
        situation: "Starting to speak",
        say: "Your Honor, may I be heard?"
      },
      {
        situation: "Introducing yourself",
        say: "Good morning, Your Honor. I am [YOUR NAME], appearing pro se in this matter as the [Petitioner/Respondent]."
      },
      {
        situation: "Asking for clarification",
        say: "Your Honor, I want to make sure I understand the Court's ruling. Are you saying that [restate what you understood]?"
      },
      {
        situation: "Disagreeing with a ruling — making your record",
        say: "Your Honor, I respectfully object to that ruling and ask that the Court note my objection for the record. My basis is [brief reason]. I understand the Court has ruled, and I will proceed accordingly."
      },
      {
        situation: "Asking for more time to respond",
        say: "Your Honor, I am appearing pro se and was not aware of [this issue/this filing] until recently. I respectfully request a brief continuance of [X days] to prepare an adequate response. I am prepared to explain the need in more detail if the Court wishes."
      }
    ]
  },

  opening_statement: {
    title: "Opening Statement Scripts",
    rules: [
      "Tell the judge what you will prove — not what already happened",
      "Be brief and specific — judges have heard everything",
      "Lead with your strongest point",
      "Never argue in an opening — save that for closing",
      "End by telling the judge exactly what you want"
    ],
    scripts: [
      {
        situation: "Basic opening statement structure",
        say: `Your Honor, my name is [NAME] and I am the [Petitioner/Respondent] in this case.

The evidence in this case will show [YOUR MAIN POINT — e.g., 'that I have been the primary caregiver for my child for the past three years, that I have never been found unfit, and that the other party has violated this Court's order on [NUMBER] occasions.']

The evidence will also show [SECOND POINT — e.g., 'that the other party's allegations are unsupported by any records, any witnesses, or any credible evidence.']

At the conclusion of this hearing, I will ask this Court to [EXACTLY WHAT YOU WANT — e.g., 'grant my motion to modify visitation and hold the Respondent in contempt.']

Thank you, Your Honor.`
      },
      {
        situation: "Opening in a custody hearing",
        say: `Your Honor, this case is about the best interest of [CHILD'S NAME].

The evidence will show that I have been the primary caregiver in [his/her] life — handling [school, medical appointments, daily care, etc.]. The evidence will show that [CHILD] is thriving in my care, and that the proposed modification is not supported by any change in circumstances that would warrant disrupting [his/her] stability.

The United States Supreme Court has made clear in Troxel v. Granville that parents have a fundamental constitutional right to direct the care of their children. I am asking this Court to honor that right today.

I will ask this Court to [YOUR SPECIFIC REQUEST].`
      },
      {
        situation: "Opening in a DCF/child welfare hearing",
        say: `Your Honor, I appear today as a parent who has not been found unfit, has not been charged with any crime, and who has a fundamental constitutional right — recognized by this Court and the United States Supreme Court — to the care and custody of my child.

The evidence will show that the agency's actions in this case have not met the clear and convincing standard required before any state may interfere with my parental rights under Santosky v. Kramer, 455 U.S. 745.

I will ask this Court to [YOUR SPECIFIC REQUEST — return my child / dismiss the petition / order the agency to comply with the reunification plan].`
      }
    ]
  },

  objection: {
    title: "How to Make Objections",
    rules: [
      "Stand up and say 'Objection' loudly and clearly",
      "State the legal basis immediately — one or two words",
      "Wait for the judge to rule before explaining further",
      "If overruled, say 'Note my objection for the record'",
      "Don't over-object — only object when it matters"
    ],
    scripts: [
      { situation: "Hearsay", say: "Objection, Your Honor. Hearsay." },
      { situation: "Leading question (cross-exam only allowed for opposing witnesses)", say: "Objection, Your Honor. Leading." },
      { situation: "Relevance", say: "Objection, Your Honor. Relevance. This has no bearing on the issues before the Court today." },
      { situation: "Foundation not established", say: "Objection, Your Honor. Lack of foundation. Counsel has not established that this witness has personal knowledge of this matter." },
      { situation: "Speculation", say: "Objection, Your Honor. Calls for speculation. The witness has no personal knowledge of this." },
      { situation: "Asked and answered", say: "Objection, Your Honor. Asked and answered." },
      { situation: "Argumentative", say: "Objection, Your Honor. Argumentative." },
      { situation: "Improper character evidence", say: "Objection, Your Honor. Improper character evidence under [your state's evidence rules]." },
      { situation: "Document not in evidence", say: "Objection, Your Honor. That document has not been admitted into evidence." },
      { situation: "After objection is overruled", say: "I understand, Your Honor. I note my objection for the record." }
    ]
  },

  cross_examination: {
    title: "Cross-Examination Scripts",
    rules: [
      "Ask only leading questions — questions that contain the answer",
      "Never ask a question you don't already know the answer to",
      "One fact per question — never combine",
      "Cut off a witness who wanders: 'Your Honor, I ask that the witness be directed to answer yes or no'",
      "Your goal is to control the witness, not have a conversation",
      "End on your strongest point"
    ],
    scripts: [
      {
        situation: "Controlling a witness who won't answer directly",
        say: "Your Honor, I ask that the witness be directed to answer the question yes or no."
      },
      {
        situation: "Impeaching a witness with a prior inconsistent statement",
        say: "You testified today that [STATEMENT]. But on [DATE], you said [DIFFERENT STATEMENT] — isn't that correct? [Show the document.] That's your signature on that document, isn't it? And that says [QUOTE], doesn't it? So your testimony today is different from what you said on [DATE] — correct?"
      },
      {
        situation: "Attacking credibility of a caseworker",
        say: "You were assigned to this case on [DATE] — correct? And you visited the home [X] times total? Each visit lasted approximately [X] minutes? And you did not speak to [child's teacher / doctor / neighbor] before making your recommendation — is that right? So your recommendation was based entirely on [what the other parent told you / your own observations during those brief visits]?"
      },
      {
        situation: "Cross-examining a GAL",
        say: "You were appointed as Guardian ad Litem on [DATE] — correct? In the time since your appointment, how many times have you observed [CHILD] with me specifically? Did you review [CHILD]'s school records? Medical records? Did you speak to [CHILD]'s teachers? And despite not reviewing those records, you made a recommendation to this Court — correct?"
      }
    ]
  },

  affirmative_defense: {
    title: "Raising Affirmative Defenses",
    rules: [
      "An affirmative defense must be pled in your Answer — don't wait for trial",
      "You must prove each element of your affirmative defense",
      "Think of it like a counterclaim — YOU are proving YOUR facts",
      "File affirmative defenses in writing FIRST, then argue them at hearing"
    ],
    scripts: [
      {
        situation: "Introducing your affirmative defenses at hearing",
        say: "Your Honor, as set forth in my Answer filed on [DATE], I am raising the affirmative defense of [NAME OF DEFENSE]. The elements of this defense are [list them]. The evidence will show [how you meet each element]."
      },
      {
        situation: "Due process defense in DCF/family court",
        say: "Your Honor, I raise a due process defense. Before any state may terminate or substantially restrict a parent's rights, it must provide adequate notice and a meaningful opportunity to be heard. The 14th Amendment, as interpreted in Stanley v. Illinois, 405 U.S. 645, and Santosky v. Kramer, 455 U.S. 745, requires that the State meet a clear and convincing evidence standard. The State has not met that standard here."
      },
      {
        situation: "Parental rights as fundamental right defense",
        say: "Your Honor, I assert the affirmative defense of fundamental parental rights. The Supreme Court held in Troxel v. Granville, 530 U.S. 57, that parents have a fundamental constitutional right to make decisions concerning the care, custody, and control of their children. Any state interference with that right requires compelling justification and due process. The evidence in this case does not meet that standard."
      }
    ]
  },

  custody_hearing: {
    title: "Custody Hearing — What to Say",
    rules: [
      "Always focus on the child's best interest — use those exact words",
      "Have specific facts ready: school, medical, daily routines",
      "Never attack the other parent directly — let the facts speak",
      "Know your state's best interest factors cold",
      "Cite the UCCJEA if jurisdiction is an issue"
    ],
    scripts: [
      {
        situation: "Arguing for custody modification",
        say: `Your Honor, I am requesting a modification of custody based on a material change in circumstances since the last order.

Specifically, since the entry of the [DATE] order, the following has changed: [DESCRIBE CHANGE — e.g., 'the other parent relocated without notice, the child's grades have declined significantly, the child has missed [X] days of school'].

Under this state's law, a modification is appropriate when there has been a material change in circumstances and the modification is in the child's best interest.

The evidence will show that [CHILD]'s best interest requires [YOUR REQUESTED CHANGE] because [SPECIFIC REASONS].`
      },
      {
        situation: "Responding to false allegations",
        say: `Your Honor, the allegations made against me are false, unsupported by any credible evidence, and appear designed to gain a tactical advantage in this litigation rather than to protect my child.

I have [RECORDS / WITNESSES / DOCUMENTS] that directly contradict each of these allegations. I ask this Court to require the other party to produce the specific factual basis for each allegation before any action is taken, and to consider the pattern of false allegations in evaluating the other party's credibility.`
      },
      {
        situation: "When the GAL recommendation is against you",
        say: `Your Honor, I respectfully ask this Court to look beyond the GAL's recommendation and examine the underlying facts.

The GAL's report is based on [LIMITED CONTACT / INCOMPLETE RECORDS / ONLY ONE PARENT'S PERSPECTIVE]. Specifically, the GAL did not [review school records / speak to the child's doctor / observe the child in my home / speak to these specific witnesses].

I have evidence that directly contradicts the GAL's findings, and I ask for the opportunity to present it. The Court is not bound by the GAL's recommendation — the Court's obligation is to make an independent determination of what is in [CHILD]'s best interest.`
      }
    ]
  },

  dcf_hearing: {
    title: "DCF / Child Welfare Hearing — What to Say",
    rules: [
      "Assert your constitutional rights from the start — don't wait",
      "Demand to see all records the agency relied on",
      "Know your right under 42 U.S.C. § 5106a to access records",
      "Challenge every allegation — make them prove each element",
      "Put everything on the record — assume the judge doesn't know the file"
    ],
    scripts: [
      {
        situation: "Opening in any DCF hearing",
        say: `Your Honor, before we proceed I want to place on the record that I am a fit parent who has not been adjudicated unfit, has not been convicted of any crime against my child, and who retains all constitutional rights to the care and custody of my child under the 14th Amendment and Troxel v. Granville, 530 U.S. 57 (2000).

I have not received all records the agency relies upon, and I object to proceeding without full disclosure of those records as required by 42 U.S.C. § 5106a.`
      },
      {
        situation: "Challenging removal of a child",
        say: `Your Honor, the removal of my child was not supported by clear and convincing evidence as required by Santosky v. Kramer, 455 U.S. 745. The State must show by clear and convincing evidence — not suspicion, not an unverified report — that my child faced imminent harm.

I am asking this Court to return my child immediately, or in the alternative, to set an emergency evidentiary hearing within [X] days so I can present evidence that the removal was not legally justified.`
      },
      {
        situation: "Demanding compliance with a reunification plan",
        say: `Your Honor, I have complied with every requirement of the reunification plan. I have [LIST WHAT YOU HAVE DONE — completed parenting classes, drug tests, therapy, etc.].

The agency has not documented any failure on my part. Under the reunification plan and applicable law, I am entitled to have my child returned. I am asking this Court to order the agency to either show specific cause for continued removal or return my child forthwith.`
      }
    ]
  },

  contempt_hearing: {
    title: "Contempt Hearing — What to Say",
    rules: [
      "Contempt requires: (1) a valid court order, (2) knowledge of the order, (3) ability to comply, (4) willful non-compliance",
      "Have the exact order language ready to read to the judge",
      "Document every violation with dates, times, witnesses",
      "If you are the one being accused of contempt — challenge willfulness"
    ],
    scripts: [
      {
        situation: "Filing for contempt — presenting your case",
        say: `Your Honor, I am asking this Court to hold [OTHER PARTY] in contempt for willful violation of this Court's order dated [DATE].

That order specifically states — and I am reading from page [X]: '[EXACT LANGUAGE FROM ORDER].'

On [DATE], [OTHER PARTY] violated that order by [SPECIFIC VIOLATION]. I have [EVIDENCE — texts, emails, witnesses, records] documenting this violation.

This Court has the authority and the obligation to enforce its own orders. I am asking for [SPECIFIC RELIEF — makeup time, sanctions, attorney fees if applicable, incarceration as last resort].`
      },
      {
        situation: "Defending against a contempt charge",
        say: `Your Honor, I was not in willful contempt of this Court's order.

[Choose what applies:]
— I did not have the ability to comply because [REASON].
— I complied substantially with the order. The specific allegation that I violated [X] is incorrect because [REASON WITH EVIDENCE].
— The order itself is ambiguous as to [SPECIFIC POINT], and I interpreted it in good faith as requiring [WHAT YOU DID].

Contempt requires willful non-compliance. I ask this Court to find that my conduct, while [acknowledging any partial non-compliance], did not rise to the level of willful contempt.`
      }
    ]
  },

  closing_argument: {
    title: "Closing Argument — How to Finish Strong",
    rules: [
      "Closing is where you ARGUE — connect the evidence to the law",
      "Remind the judge of every key piece of evidence",
      "Tell the judge exactly what you want and why you deserve it",
      "Address the other side's strongest argument and defeat it",
      "End powerfully — the last thing the judge hears matters"
    ],
    scripts: [
      {
        situation: "Closing argument structure",
        say: `Your Honor, the evidence in this case has shown [SUMMARIZE YOUR 3 STRONGEST POINTS].

The other party argued [THEIR MAIN ARGUMENT]. But the evidence shows [WHY THEY'RE WRONG].

The law in this case is clear: [CITE YOUR KEY STATUTE OR CASE]. Under that standard, I have met my burden of proof.

I am asking this Court to [EXACTLY WHAT YOU WANT] because [BRIEF REASON TIED TO EVIDENCE].

The facts are on my side. The law is on my side. I ask for justice for [myself / my child / my family]. Thank you, Your Honor.`
      },
      {
        situation: "Closing in a custody case",
        say: `Your Honor, this case has always been about one thing: what is in [CHILD]'s best interest.

The evidence showed that I am the parent who [LIST YOUR STRENGTHS — takes child to school, attends all medical appointments, maintains stability, etc.].

The evidence also showed that [OPPONENT]'s allegations were [unsupported / contradicted by the records / contradicted by the witnesses].

The Supreme Court in Troxel v. Granville recognized that fit parents act in their children's best interest. I am a fit parent. My child is thriving in my care. There is no basis — legal or factual — to change that.

I ask this Court to rule in my favor and protect my child's stability and wellbeing.`
      }
    ]
  }
};

// ─── PRACTICE MODE ────────────────────────────────────────────────────────────

/**
 * Generate a courtroom practice scenario based on user's case type and situation.
 * The AI takes on the role of judge or opposing counsel and the user practices
 * what they would say.
 */
export function getPracticeScenario(situation, caseType, state) {
  const scenarios = {
    custody_hearing: {
      setup: `You are in a custody modification hearing in ${state}. The other parent has filed a motion to restrict your visitation. The judge has just said: "Counsel for the Petitioner has just finished their opening statement. You may proceed, [Your Name]."`,
      judgeRole: "I will play the judge. Respond to what you say and ask follow-up questions.",
      tips: ["Remember to say 'Your Honor'", "Lead with the best interest of your child", "Have your facts ready — school, medical, daily routine"]
    },
    dcf_hearing: {
      setup: `You are at a shelter care hearing in ${state}. Your child was removed 48 hours ago. The agency attorney has just told the judge their reasons for removal. The judge says: "Does the parent wish to be heard?"`,
      judgeRole: "I will play the judge. I will challenge your arguments as a real judge would.",
      tips: ["Assert your constitutional rights immediately", "Challenge the agency to prove their allegations", "Ask for your child's immediate return or a specific hearing date"]
    },
    contempt_hearing: {
      setup: `You are presenting a contempt motion in ${state}. You have a court order from [DATE] that the other party has violated. The judge says: "You filed this motion. Tell me what happened."`,
      judgeRole: "I will play the judge and ask clarifying questions.",
      tips: ["Read the exact order language", "Give specific dates and incidents", "Ask for specific relief"]
    }
  };

  return scenarios[caseType] || scenarios.custody_hearing;
}

/**
 * Build the AI prompt for courtroom coach responses.
 * This is what gets sent to the AI API when a user asks "what do I say?"
 */
export function buildCourtCoachPrompt(situation, userFacts, state, caseType) {
  const script = COURT_SCRIPTS[situation];
  const situationLabel = COURT_SITUATIONS[situation]?.label || situation;

  return `You are an expert courtroom coach for pro se litigants. You have 12+ years of experience helping parents navigate family court, DCF hearings, and civil litigation without an attorney.

The user is asking: "What do I say in court for: ${situationLabel}?"

Their state: ${state}
Their case type: ${caseType}
Their specific situation: ${JSON.stringify(userFacts)}

COACHING RULES:
1. Give EXACT words they can say — complete sentences, not summaries
2. Format responses as scripts with clear situation labels
3. Explain WHY each phrase works legally
4. Warn them about common mistakes
5. Reference relevant law when applicable (Troxel v. Granville for parental rights, Santosky v. Kramer for DCF burden of proof, 42 U.S.C. § 5106a for records access)
6. Keep it practical — they are in a real courtroom, not a classroom
7. Always remind them: "This is legal information, not legal advice."

KNOWN SCRIPTS FOR THIS SITUATION:
${script ? JSON.stringify(script.scripts, null, 2) : 'Use your knowledge to generate appropriate scripts.'}

KEY RULES FOR THIS SITUATION:
${script ? script.rules.join('\n') : ''}

Generate a personalized, detailed coaching response with exact scripts tailored to their specific situation.`;
}
