import type { Topic } from "@/lib/types";

// Hand-authored study content for the AI field topics (the ranking test).
// NOT LLM-generated — accuracy matters for the ranking test. Concept notes are
// grounded in well-established facts; candidates should still verify exact
// figures (thresholds, article numbers, dates) against the primary sources,
// since the exam tests precise detail. Each topic has:
//  - concepts: structured sections with key points
//  - flashcards: term -> concise definition for active recall
//  - a short "verify against" pointer to the primary source

export interface ConceptSection {
  heading: string;
  points: string[]; // each a concise, factual bullet
}

export interface Flashcard {
  front: string; // term or question
  back: string; // concise answer/definition
}

export interface StudyContent {
  topic: Topic;
  summary: string; // one-paragraph orientation
  verifyAgainst: string; // primary source to confirm exact details
  concepts: ConceptSection[];
  flashcards: Flashcard[];
}

export const STUDY_CONTENT: Partial<Record<Topic, StudyContent>> = {
  "ai-act": {
    topic: "ai-act",
    summary:
      "The EU AI Act (Regulation (EU) 2024/1689) is the world's first comprehensive horizontal AI law. It is a RISK-BASED framework: obligations scale with the risk an AI system poses, from banned practices down to minimal-risk systems with no obligations. Learn the four risk tiers, what sits in each, the GPAI rules, who enforces it, and the timeline.",
    verifyAgainst: "Regulation (EU) 2024/1689 — the AI Act text on EUR-Lex. Check Articles 5, 6, Annex III, and the GPAI chapter for exact wording.",
    concepts: [
      {
        heading: "The four risk tiers",
        points: [
          "UNACCEPTABLE risk → PROHIBITED (Article 5). Banned outright.",
          "HIGH risk → permitted but heavily regulated (conformity assessment, risk management, human oversight, logging, documentation). Listed in Annex III + products under Annex I.",
          "LIMITED risk → transparency obligations only (Article 50): users must be told they are interacting with AI; deepfakes/AI content must be labelled.",
          "MINIMAL risk → no obligations (e.g. spam filters, AI in video games). The vast majority of systems.",
        ],
      },
      {
        heading: "Prohibited practices (Article 5)",
        points: [
          "Social scoring by public authorities.",
          "Manipulative or deceptive techniques that cause significant harm.",
          "Exploiting vulnerabilities (age, disability, socio-economic situation).",
          "Untargeted scraping of facial images to build recognition databases.",
          "Emotion recognition in workplaces and schools (with narrow exceptions).",
          "Real-time remote biometric identification in public spaces by law enforcement (narrow exceptions, prior authorisation).",
          "Biometric categorisation inferring sensitive attributes (race, political views, etc.).",
        ],
      },
      {
        heading: "High-risk systems (Annex III examples)",
        points: [
          "Employment: recruitment, candidate evaluation, promotion/termination decisions.",
          "Education: admissions, scoring exams.",
          "Essential services: creditworthiness/credit scoring, insurance risk, emergency services dispatch.",
          "Law enforcement, migration/border control, administration of justice.",
          "Critical infrastructure safety components; certain medical devices (Annex I).",
          "Obligations: risk management system, data governance, technical documentation, logging, transparency, human oversight, accuracy/robustness/cybersecurity, conformity assessment + CE marking.",
        ],
      },
      {
        heading: "General-Purpose AI (GPAI) models",
        points: [
          "GPAI = models trained on broad data, usable for many tasks (e.g. large language models).",
          "All GPAI providers: technical documentation, copyright policy, summary of training data.",
          "GPAI with SYSTEMIC RISK: extra obligations (model evaluation, adversarial testing, incident reporting, cybersecurity).",
          "Systemic risk is PRESUMED when cumulative training compute exceeds 10^25 FLOPs (floating-point operations).",
        ],
      },
      {
        heading: "Governance & enforcement",
        points: [
          "European AI Office (within the Commission) oversees GPAI models and coordinates consistent application.",
          "European Artificial Intelligence Board — coordination among Member States.",
          "National competent authorities enforce at Member State level.",
          "Penalties scale by severity: up to €35m or 7% of global annual turnover for prohibited-practice breaches (highest tier); lower tiers for other breaches.",
        ],
      },
      {
        heading: "Timeline (phased application)",
        points: [
          "Entered into force August 2024.",
          "Prohibitions apply first (≈6 months after entry into force).",
          "GPAI rules ≈12 months; most high-risk obligations ≈24–36 months.",
          "Phased so industry can adapt; check exact dates against the Act.",
        ],
      },
    ],
    flashcards: [
      { front: "What regulation is the EU AI Act?", back: "Regulation (EU) 2024/1689." },
      { front: "On what basis does the AI Act classify systems?", back: "Risk: unacceptable / high / limited / minimal." },
      { front: "Which risk tier is PROHIBITED?", back: "Unacceptable risk (Article 5)." },
      { front: "Where are high-risk use cases listed?", back: "Annex III (plus Annex I products)." },
      { front: "Obligation for limited-risk systems?", back: "Transparency (Article 50) — tell users it's AI; label AI content/deepfakes." },
      { front: "What triggers 'systemic risk' presumption for GPAI?", back: "Cumulative training compute > 10^25 FLOPs." },
      { front: "Who oversees GPAI models?", back: "The European AI Office (within the Commission)." },
      { front: "Max penalty tier?", back: "Up to €35m or 7% of global annual turnover (prohibited-practice breaches)." },
      { front: "Is recruitment AI high-risk?", back: "Yes — employment/recruitment is listed in Annex III." },
      { front: "Example of a prohibited practice?", back: "Social scoring by public authorities; untargeted facial-image scraping; workplace emotion recognition." },
    ],
  },

  "ml-fundamentals": {
    topic: "ml-fundamentals",
    summary:
      "Core machine-learning concepts: the three learning paradigms, the bias–variance tradeoff, over/underfitting and how to control them, the train/validation/test split, and the metrics used to evaluate models. These are the building blocks every other AI topic rests on.",
    verifyAgainst: "A standard ML reference (e.g. the scikit-learn user guide, or Goodfellow et al. 'Deep Learning' for depth).",
    concepts: [
      {
        heading: "Learning paradigms",
        points: [
          "SUPERVISED: learns from labelled input–output pairs (classification, regression).",
          "UNSUPERVISED: finds structure in unlabelled data (clustering, dimensionality reduction).",
          "REINFORCEMENT: an agent learns by trial and error from rewards/penalties.",
          "(Semi-supervised and self-supervised sit between supervised and unsupervised.)",
        ],
      },
      {
        heading: "Over/underfitting & bias–variance",
        points: [
          "OVERFITTING: great on training data, poor on unseen data — the model memorised noise. High variance.",
          "UNDERFITTING: poor on both training and test data — the model is too simple. High bias.",
          "Bias–variance tradeoff: reducing one tends to increase the other; aim for the balance that minimises total error.",
        ],
      },
      {
        heading: "Controlling overfitting",
        points: [
          "Regularisation: L1 (lasso), L2 (ridge), dropout (neural nets) — penalise complexity.",
          "More/better training data; data augmentation.",
          "Early stopping; cross-validation; simpler model/fewer parameters.",
        ],
      },
      {
        heading: "Data splits & validation",
        points: [
          "TRAIN: fit the model. VALIDATION: tune hyperparameters / select models. TEST: final unbiased estimate — touch once.",
          "k-fold cross-validation: rotate the validation fold to use data efficiently.",
          "Never let test data influence training (data leakage inflates results).",
        ],
      },
      {
        heading: "Evaluation metrics",
        points: [
          "Classification: accuracy, precision, recall, F1, ROC-AUC, confusion matrix.",
          "Precision = of predicted positives, how many are right; Recall = of actual positives, how many caught.",
          "Imbalanced data: accuracy misleads — prefer precision/recall/F1.",
          "Regression: MAE, MSE/RMSE, R².",
        ],
      },
    ],
    flashcards: [
      { front: "Supervised vs unsupervised learning?", back: "Supervised uses labelled pairs; unsupervised finds structure in unlabelled data." },
      { front: "Overfitting?", back: "Great on training, poor on unseen data — memorised noise (high variance)." },
      { front: "Underfitting?", back: "Poor on both train and test — model too simple (high bias)." },
      { front: "Most direct fix for overfitting?", back: "Regularisation (L1/L2, dropout) + more data / early stopping." },
      { front: "Purpose of the validation set?", back: "Tune hyperparameters and select models without touching the test set." },
      { front: "Why is accuracy misleading on imbalanced data?", back: "A model predicting the majority class scores high accuracy but misses the minority — use precision/recall/F1." },
      { front: "Precision vs recall?", back: "Precision = correct among predicted positives; recall = caught among actual positives." },
      { front: "Reinforcement learning signal?", back: "Rewards/penalties from the environment; the agent learns by trial and error." },
    ],
  },

  "genai-rag": {
    topic: "genai-rag",
    summary:
      "Generative AI and the technologies around large language models: the transformer architecture, tokens and embeddings, hallucination, Retrieval-Augmented Generation (RAG), fine-tuning vs prompting, vector databases, and agentic AI. This is the fastest-moving field area.",
    verifyAgainst: "'Attention Is All You Need' (Vaswani et al., 2017) for transformers; current vendor docs for RAG/agents.",
    concepts: [
      {
        heading: "Transformers & LLMs",
        points: [
          "The transformer (2017) is built on SELF-ATTENTION — each token attends to all others, capturing context.",
          "Replaced recurrence (RNN/LSTM) and convolution for sequence modelling; enables parallel training at scale.",
          "LLMs are large transformers trained to predict the next token over huge text corpora.",
          "TOKENS: text is split into tokens (sub-words). EMBEDDINGS: tokens/text mapped to vectors capturing meaning.",
        ],
      },
      {
        heading: "Hallucination",
        points: [
          "Hallucination = the model generates plausible-sounding but factually wrong or fabricated content.",
          "Cause: the model predicts likely text, not verified truth.",
          "Mitigations: RAG (ground in retrieved facts), citations, lower temperature, human review, guardrails.",
        ],
      },
      {
        heading: "Retrieval-Augmented Generation (RAG)",
        points: [
          "RAG retrieves relevant external documents and adds them to the model's context before generating.",
          "Grounds answers in a knowledge source → reduces hallucination, enables up-to-date/private data without retraining.",
          "Pipeline: embed documents → store in a VECTOR DATABASE → embed the query → retrieve nearest chunks → generate with them in context.",
        ],
      },
      {
        heading: "Adapting a model: fine-tuning vs prompting vs RAG",
        points: [
          "PROMPTING: change the input; no training. Cheapest, fastest.",
          "RAG: inject retrieved knowledge at inference; good for changing/private facts.",
          "FINE-TUNING: further-train on task data; changes the weights; best for style/format/behaviour, costlier.",
        ],
      },
      {
        heading: "Agentic AI",
        points: [
          "Agentic AI = systems that autonomously PLAN and EXECUTE multi-step tasks, often calling external TOOLS, toward a goal.",
          "Loop: plan → act (tool use) → observe result → adjust — unlike a single prompt→response.",
          "Tools: web search, code execution, APIs, databases, file I/O.",
        ],
      },
    ],
    flashcards: [
      { front: "Core mechanism of the transformer?", back: "Self-attention ('Attention Is All You Need', 2017)." },
      { front: "What is hallucination?", back: "Plausible-sounding but factually wrong/fabricated model output." },
      { front: "What does RAG do?", back: "Retrieves relevant external documents and adds them to the context to ground the answer." },
      { front: "Why use RAG over fine-tuning for current facts?", back: "RAG injects up-to-date/private data at inference without retraining the model." },
      { front: "Tokens vs embeddings?", back: "Tokens are sub-word text units; embeddings are vectors capturing their meaning." },
      { front: "What is agentic AI?", back: "Systems that autonomously plan and execute multi-step tasks, calling external tools toward a goal." },
      { front: "Where are document vectors stored for RAG?", back: "A vector database (for nearest-neighbour similarity search)." },
      { front: "Prompting vs fine-tuning?", back: "Prompting changes the input (no training); fine-tuning further-trains and changes the weights." },
    ],
  },

  mlops: {
    topic: "mlops",
    summary:
      "MLOps applies DevOps discipline to machine learning: getting models reliably into production and keeping them healthy. Key ideas: the model lifecycle, CI/CD for models, the model registry, monitoring, data/concept drift and retraining, and data governance.",
    verifyAgainst: "Google's 'MLOps: Continuous delivery and automation pipelines in ML' and standard MLOps references.",
    concepts: [
      {
        heading: "The model lifecycle",
        points: [
          "Data collection → preparation → training → evaluation → deployment → monitoring → retraining.",
          "It is a LOOP, not a one-off: production models degrade and must be maintained.",
        ],
      },
      {
        heading: "Model drift",
        points: [
          "DRIFT = model performance degrades as real-world data diverges from training data.",
          "DATA (covariate) drift: input distribution changes. CONCEPT drift: the input→output relationship changes.",
          "Mitigation: continuous MONITORING + automated RETRAINING triggers.",
        ],
      },
      {
        heading: "Core MLOps components",
        points: [
          "MODEL REGISTRY: versioned store of trained model artefacts + metadata/lineage.",
          "CI/CD for ML: automated testing, validation and deployment of models and pipelines.",
          "Feature store: consistent, reusable feature definitions across training and serving.",
          "Monitoring: track accuracy, latency, drift, data quality in production.",
        ],
      },
      {
        heading: "Governance",
        points: [
          "Reproducibility: version data, code AND models together.",
          "Lineage/audit: know which data+code produced which model (important under the AI Act).",
          "Data pipelines must be reliable and governed (quality, access, privacy).",
        ],
      },
    ],
    flashcards: [
      { front: "What is model drift?", back: "Performance degradation as live data diverges from the training data." },
      { front: "Data drift vs concept drift?", back: "Data drift = input distribution changes; concept drift = the input→output relationship changes." },
      { front: "Most direct fix for drift?", back: "Continuous monitoring + automated retraining triggers." },
      { front: "What is a model registry?", back: "A versioned store of trained model artefacts and their metadata/lineage." },
      { front: "Why is the ML lifecycle a loop?", back: "Production models degrade over time and must be monitored and retrained." },
      { front: "What does a feature store give you?", back: "Consistent, reusable feature definitions shared between training and serving." },
    ],
  },

  "trustworthy-ai": {
    topic: "trustworthy-ai",
    summary:
      "Trustworthy AI covers the ethical and robustness requirements for responsible AI: the EU's seven key requirements, explainability (XAI), fairness/bias, robustness, human oversight, and the GDPR Article 22 link on automated decisions.",
    verifyAgainst: "EU High-Level Expert Group 'Ethics Guidelines for Trustworthy AI' (2019); GDPR Article 22.",
    concepts: [
      {
        heading: "The seven requirements (EU Ethics Guidelines)",
        points: [
          "1. Human agency and oversight.",
          "2. Technical robustness and safety.",
          "3. Privacy and data governance.",
          "4. Transparency.",
          "5. Diversity, non-discrimination and fairness.",
          "6. Societal and environmental well-being.",
          "7. Accountability.",
        ],
      },
      {
        heading: "Explainability (XAI)",
        points: [
          "XAI = the ability to give human-understandable reasons for a model's outputs.",
          "Matters for trust, debugging, legal compliance, and contesting decisions.",
          "Techniques: feature importance, SHAP, LIME, attention visualisation, interpretable-by-design models.",
        ],
      },
      {
        heading: "Fairness & bias",
        points: [
          "Bias can enter via training data, labels, features, or deployment context.",
          "Fairness is multi-definitional (demographic parity, equal opportunity, etc.) — definitions can conflict.",
          "Mitigation: representative data, bias audits, fairness constraints, monitoring outcomes by group.",
        ],
      },
      {
        heading: "GDPR Article 22",
        points: [
          "Right not to be subject to a decision based SOLELY on automated processing that produces legal or similarly significant effects — with safeguards and exceptions.",
          "Links to transparency and the right to human intervention/contestation.",
        ],
      },
    ],
    flashcards: [
      { front: "What is explainability (XAI)?", back: "Giving human-understandable reasons for a model's outputs." },
      { front: "Name a pillar of EU Trustworthy AI.", back: "Human agency and oversight (one of the 7 requirements)." },
      { front: "How many requirements in the EU Trustworthy AI guidelines?", back: "Seven." },
      { front: "What does GDPR Article 22 protect?", back: "The right not to be subject to a decision based solely on automated processing with legal/significant effect (with safeguards)." },
      { front: "Where can bias enter an ML system?", back: "Training data, labels, feature choice, or deployment context." },
      { front: "Name two XAI techniques.", back: "SHAP and LIME (also feature importance, attention visualisation)." },
    ],
  },

  policy: {
    topic: "policy",
    summary:
      "EU AI policy and governance: why the EU regulates AI via a single harmonised Regulation, the GPAI ecosystem, the role of the AI Office, and AI policy in the EU-institutional context. This topic is about the 'why' and the institutions, not the technical details.",
    verifyAgainst: "The AI Act recitals (rationale) and EU institutional sources on digital policy.",
    concepts: [
      {
        heading: "Why a Regulation (not national rules)",
        points: [
          "A REGULATION applies directly and uniformly across all Member States — no transposition needed.",
          "Rationale: a harmonised single market with consistent rules; avoid fragmentation that would burden business and weaken rights protection.",
          "Legal basis: internal-market harmonisation.",
        ],
      },
      {
        heading: "Key bodies",
        points: [
          "European AI Office (within the Commission): oversees GPAI, coordinates consistent application, supports enforcement.",
          "European Artificial Intelligence Board: Member State coordination.",
          "Scientific panel of independent experts; advisory forum of stakeholders.",
          "National competent authorities: market surveillance + enforcement nationally.",
        ],
      },
      {
        heading: "Policy aims & context",
        points: [
          "Balance innovation with fundamental-rights protection and safety ('human-centric, trustworthy AI').",
          "Regulatory sandboxes to support innovation, especially for SMEs/start-ups.",
          "Part of the wider EU digital strategy (alongside GDPR, Digital Services Act, Digital Markets Act, Data Act).",
          "The 'Brussels effect': EU rules often become de facto global standards.",
        ],
      },
    ],
    flashcards: [
      { front: "Why regulate AI by a Regulation rather than per Member State?", back: "To harmonise the single market with directly-applicable, consistent rules and avoid fragmentation." },
      { front: "What does the European AI Office do?", back: "Oversees GPAI models and coordinates consistent application of the AI Act across the EU." },
      { front: "What are regulatory sandboxes for?", back: "Controlled environments to support AI innovation, especially for SMEs/start-ups." },
      { front: "What is the 'Brussels effect'?", back: "EU regulations tending to become de facto global standards." },
      { front: "Name two other EU digital laws alongside the AI Act.", back: "GDPR, Digital Services Act, Digital Markets Act, Data Act (any two)." },
      { front: "Regulation vs Directive — key difference?", back: "A Regulation applies directly/uniformly; a Directive must be transposed into national law." },
    ],
  },
};
