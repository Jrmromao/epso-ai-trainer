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
      {
        heading: "Scope & key definitions",
        points: [
          "'AI system' (aligned with the OECD definition): a machine-based system that, for explicit or implicit objectives, infers from input how to generate outputs (predictions, content, recommendations, decisions) that can influence environments.",
          "Applies to PROVIDERS (develop/place on market), DEPLOYERS (use under their authority), importers, distributors — extraterritorial: applies if output is used in the EU, wherever the provider sits.",
          "Exclusions: military/defence/national-security use, pure scientific R&D, and (largely) free-and-open-source components unless high-risk or GPAI.",
        ],
      },
      {
        heading: "High-risk — the two routes to being 'high-risk'",
        points: [
          "Route 1 (Annex I): AI that is a safety component of a product already covered by EU product-safety law (machinery, medical devices, toys, etc.) requiring third-party conformity assessment.",
          "Route 2 (Annex III): the eight listed areas — biometrics; critical infrastructure; education; employment; access to essential private/public services (incl. credit, insurance); law enforcement; migration/asylum/border control; administration of justice & democratic processes.",
          "Filter: an Annex III system is NOT high-risk if it performs only a narrow procedural task / doesn't materially influence the outcome — but profiling of natural persons is always high-risk.",
        ],
      },
      {
        heading: "Provider obligations for high-risk systems",
        points: [
          "Risk management system (continuous, across the lifecycle).",
          "Data governance: relevant, representative, error-free-as-far-as-possible training/validation/test data.",
          "Technical documentation + automatic record-keeping (logs).",
          "Transparency & instructions for use to deployers.",
          "Human oversight by design; accuracy, robustness & cybersecurity.",
          "Quality management system; conformity assessment; EU declaration of conformity + CE marking; registration in the EU database.",
        ],
      },
      {
        heading: "Deployer obligations for high-risk systems",
        points: [
          "Use in line with the instructions; ensure human oversight by competent persons.",
          "Monitor operation; keep logs; inform the provider/authority of risks or serious incidents.",
          "Fundamental Rights Impact Assessment (FRIA) for certain deployers (public bodies and some services).",
          "Inform affected persons where required; cooperate with authorities.",
        ],
      },
      {
        heading: "Transparency obligations (Article 50)",
        points: [
          "Chatbots: tell people they're interacting with an AI (unless obvious).",
          "Synthetic content (text/image/audio/video) must be marked machine-readable as AI-generated.",
          "Deepfakes must be disclosed; AI-generated text on matters of public interest must be disclosed.",
          "Emotion-recognition / biometric-categorisation systems must inform the people exposed.",
        ],
      },
      {
        heading: "GPAI — detail",
        points: [
          "All GPAI: technical documentation, info to downstream providers, EU copyright-law compliance policy, public summary of training content.",
          "Open-source GPAI get lighter obligations UNLESS they carry systemic risk.",
          "Systemic-risk GPAI (>10^25 FLOPs or designated): model evaluations incl. adversarial testing (red-teaming), systemic-risk assessment & mitigation, serious-incident tracking/reporting, adequate cybersecurity.",
          "Codes of Practice bridge the gap until harmonised standards exist.",
        ],
      },
      {
        heading: "Penalty tiers (exact)",
        points: [
          "Prohibited-practice (Art. 5) breaches: up to €35,000,000 or 7% of total worldwide annual turnover, whichever is higher.",
          "Most other obligation breaches: up to €15,000,000 or 3%.",
          "Supplying incorrect/incomplete/misleading information to authorities: up to €7,500,000 or 1%.",
          "SMEs/start-ups: the LOWER of the fixed amount or percentage applies.",
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
      { front: "Two routes to being 'high-risk'?", back: "Annex I (safety component of a regulated product) OR Annex III (one of the 8 listed areas)." },
      { front: "Who are 'providers' vs 'deployers'?", back: "Providers develop/place the system on the market; deployers use it under their own authority." },
      { front: "Does the AI Act apply outside the EU?", back: "Yes — extraterritorial: it applies if the system's output is used in the EU." },
      { front: "What must synthetic/AI content carry (Art. 50)?", back: "A machine-readable mark that it is AI-generated; deepfakes must be disclosed." },
      { front: "What is a FRIA?", back: "Fundamental Rights Impact Assessment — required of certain high-risk deployers (public bodies, some services)." },
      { front: "Penalty for other (non-Art.5) obligation breaches?", back: "Up to €15m or 3% of worldwide annual turnover." },
      { front: "Which uses are excluded from the AI Act?", back: "Military/defence/national security, pure scientific R&D, and (largely) FOSS unless high-risk/GPAI." },
      { front: "What definition of 'AI system' does the Act align with?", back: "The OECD definition — a machine-based system that infers from inputs how to generate outputs influencing environments." },
      { front: "What do systemic-risk GPAI providers must do extra?", back: "Model evaluations/red-teaming, systemic-risk mitigation, incident reporting, cybersecurity." },
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
      {
        heading: "Common algorithms",
        points: [
          "Linear/logistic regression — simple, interpretable baselines.",
          "Decision trees → random forests & gradient boosting (XGBoost) — strong on tabular data.",
          "SVM (support vector machines); k-NN; naive Bayes.",
          "k-means (clustering); PCA (dimensionality reduction) — unsupervised.",
        ],
      },
      {
        heading: "Neural networks & deep learning",
        points: [
          "Neurons in layers; weights + bias; non-linear ACTIVATION functions (ReLU, sigmoid, tanh).",
          "'Deep' = many hidden layers; learns hierarchical features automatically.",
          "CNNs for images (convolutions); RNN/LSTM for sequences; transformers now dominate sequences.",
          "Deep learning needs lots of data + compute vs classical ML.",
        ],
      },
      {
        heading: "How models learn (training)",
        points: [
          "LOSS FUNCTION measures prediction error (e.g. cross-entropy, MSE).",
          "GRADIENT DESCENT adjusts weights to reduce loss; BACKPROPAGATION computes the gradients.",
          "LEARNING RATE sets step size: too high → diverges, too low → slow.",
          "EPOCH = one full pass over the training data; mini-batches speed this up.",
        ],
      },
      {
        heading: "Features & data",
        points: [
          "FEATURE ENGINEERING: creating/selecting informative inputs — often decisive for classical ML.",
          "Normalisation/standardisation puts features on comparable scales.",
          "Encoding categoricals (one-hot, embeddings); handling missing values.",
          "The 'curse of dimensionality': too many features relative to samples hurts.",
        ],
      },
      {
        heading: "Hyperparameters vs parameters",
        points: [
          "PARAMETERS are learned from data (weights).",
          "HYPERPARAMETERS are set before training (learning rate, tree depth, #layers) and tuned on validation.",
          "Tuning methods: grid search, random search, Bayesian optimisation.",
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
      { front: "Parameters vs hyperparameters?", back: "Parameters are learned (weights); hyperparameters are set before training and tuned on validation." },
      { front: "What does gradient descent do?", back: "Adjusts weights to minimise the loss function; backpropagation computes the gradients." },
      { front: "What is an activation function for?", back: "Introduces non-linearity so networks can learn complex patterns (ReLU, sigmoid, tanh)." },
      { front: "What is an epoch?", back: "One full pass over the training dataset." },
      { front: "Good algorithm for tabular data?", back: "Gradient boosting (e.g. XGBoost) or random forests." },
      { front: "What does the learning rate control?", back: "Step size in gradient descent — too high diverges, too low is slow." },
      { front: "What is feature engineering?", back: "Creating/selecting informative input features — often decisive for classical ML." },
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
      {
        heading: "How LLMs generate (decoding)",
        points: [
          "The model outputs a probability distribution over the next token; decoding picks from it.",
          "TEMPERATURE: higher = more random/creative, lower = more deterministic/focused (0 ≈ greedy).",
          "top-k / top-p (nucleus) sampling: restrict choices to the most probable tokens.",
          "CONTEXT WINDOW: the max tokens (prompt + output) a model can attend to at once; exceeding it truncates/forgets.",
        ],
      },
      {
        heading: "Prompt engineering",
        points: [
          "ZERO-SHOT: just ask. FEW-SHOT: include worked examples in the prompt to steer format/behaviour.",
          "CHAIN-OF-THOUGHT: ask the model to reason step-by-step → better on multi-step problems.",
          "System prompt sets role/constraints; be specific, give context, specify output format.",
          "Grounding/guardrails reduce unsafe or off-task output.",
        ],
      },
      {
        heading: "Training stages of an LLM",
        points: [
          "PRE-TRAINING: self-supervised next-token prediction on massive corpora → base model.",
          "SUPERVISED FINE-TUNING (SFT): train on curated instruction→response pairs.",
          "RLHF (Reinforcement Learning from Human Feedback): align outputs to human preferences via a reward model.",
          "Result: an instruction-following, aligned assistant.",
        ],
      },
      {
        heading: "Multimodality & diffusion",
        points: [
          "Multimodal models handle more than text: images, audio, video (e.g. vision-language models).",
          "Image generation commonly uses DIFFUSION models: iteratively denoise random noise into an image, guided by a text prompt.",
          "Embeddings can be cross-modal (text and images in the same vector space).",
        ],
      },
      {
        heading: "Evaluating & limitations of GenAI",
        points: [
          "Risks: hallucination, bias from training data, prompt injection, data leakage, IP/copyright, cost/latency.",
          "PROMPT INJECTION: malicious input overrides intended instructions — a key GenAI security risk.",
          "Evaluation is hard: use benchmarks, human eval, and task-specific metrics; outputs are non-deterministic.",
          "Knowledge cutoff: a base model only 'knows' up to its training date → RAG/tools for current info.",
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
      { front: "What does temperature control?", back: "Randomness of generation — high = creative/varied, low = focused/deterministic." },
      { front: "What is the context window?", back: "The max tokens (prompt + output) the model can attend to at once." },
      { front: "Zero-shot vs few-shot prompting?", back: "Zero-shot just asks; few-shot includes worked examples to steer the model." },
      { front: "What is chain-of-thought prompting?", back: "Asking the model to reason step-by-step, improving multi-step problem solving." },
      { front: "What is RLHF?", back: "Reinforcement Learning from Human Feedback — aligns outputs to human preferences via a reward model." },
      { front: "What is prompt injection?", back: "Malicious input that overrides the intended instructions — a key GenAI security risk." },
      { front: "How are AI images typically generated?", back: "Diffusion models — iteratively denoise random noise into an image guided by a text prompt." },
      { front: "What are the three LLM training stages?", back: "Pre-training → supervised fine-tuning (SFT) → RLHF." },
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
      {
        heading: "Deployment patterns",
        points: [
          "Batch (offline) vs online/real-time serving; edge deployment for low latency.",
          "SHADOW deployment: run the new model alongside, compare, no live impact.",
          "CANARY / blue-green: roll out to a small % first, then expand if healthy.",
          "A/B testing: compare models on live traffic by metric.",
          "Rollback plan is essential if a new model underperforms.",
        ],
      },
      {
        heading: "MLOps maturity & automation",
        points: [
          "Level 0: manual, script-driven. Level 1: automated training pipeline (continuous training). Level 2: full CI/CD/CT automation.",
          "CT = Continuous Training: retrain automatically on new data or on drift signals.",
          "Pipelines orchestrate data validation → training → evaluation → deployment.",
        ],
      },
      {
        heading: "What to monitor in production",
        points: [
          "Model quality: accuracy/metrics vs ground truth (when labels arrive).",
          "Data quality & schema: nulls, ranges, unexpected categories.",
          "Drift: input distribution + prediction distribution.",
          "Operational: latency, throughput, errors, cost, resource use.",
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
      { front: "What is a canary deployment?", back: "Roll a new model out to a small % of traffic first, then expand if healthy." },
      { front: "What is shadow deployment?", back: "Run the new model alongside the live one to compare, with no impact on users." },
      { front: "What is Continuous Training (CT)?", back: "Automatically retraining the model on new data or when drift is detected." },
      { front: "Why version data, code AND model together?", back: "Reproducibility and lineage/audit — know exactly what produced a given model." },
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
      {
        heading: "Privacy-preserving techniques",
        points: [
          "DIFFERENTIAL PRIVACY: add calibrated noise so individuals can't be re-identified from outputs.",
          "FEDERATED LEARNING: train across decentralised data without moving raw data to a central server.",
          "Anonymisation/pseudonymisation; data minimisation (collect only what's needed).",
          "Links to GDPR principles: lawfulness, purpose limitation, minimisation, storage limitation.",
        ],
      },
      {
        heading: "Robustness & security threats",
        points: [
          "ADVERSARIAL EXAMPLES: inputs perturbed to fool a model (e.g. misclassify an image).",
          "DATA POISONING: corrupting training data to implant bad behaviour.",
          "MODEL INVERSION / membership inference: extracting training data or detecting if a record was used.",
          "MODEL STEALING: replicating a model via its API. Mitigate with robustness testing, monitoring, access controls.",
        ],
      },
      {
        heading: "Fairness metrics (be able to distinguish)",
        points: [
          "Demographic/statistical parity: equal positive rates across groups.",
          "Equal opportunity: equal true-positive rates across groups.",
          "Equalised odds: equal TPR and FPR across groups.",
          "Impossibility: several fairness criteria can't all hold at once (except in trivial cases) — a design choice is required.",
        ],
      },
      {
        heading: "Accountability & oversight in practice",
        points: [
          "Human-in-the-loop (approves each decision) vs human-on-the-loop (monitors) vs human-in-command (overall control).",
          "Audits, documentation (model cards, datasheets), and clear responsibility lines.",
          "Redress: affected people can contest and seek a remedy.",
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
      { front: "What is differential privacy?", back: "Adding calibrated noise so individuals can't be re-identified from a model's outputs." },
      { front: "What is federated learning?", back: "Training across decentralised data without moving raw data to a central server." },
      { front: "What is an adversarial example?", back: "An input perturbed to fool a model into a wrong output." },
      { front: "What is data poisoning?", back: "Corrupting training data to implant malicious behaviour in the model." },
      { front: "Human-in-the-loop vs on-the-loop?", back: "In-the-loop approves each decision; on-the-loop monitors and can intervene." },
      { front: "Why can't all fairness metrics hold at once?", back: "Impossibility results — criteria like parity and equalised odds conflict except in trivial cases." },
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
      {
        heading: "The EU institutions (who does what)",
        points: [
          "European COMMISSION: proposes legislation, enforces, hosts the AI Office. The EU executive.",
          "European PARLIAMENT: co-legislator, directly elected.",
          "COUNCIL of the EU: co-legislator, represents member-state governments.",
          "Ordinary legislative procedure: Commission proposes; Parliament + Council co-decide.",
          "Court of Justice of the EU (CJEU): interprets EU law.",
        ],
      },
      {
        heading: "Legal instruments",
        points: [
          "REGULATION: binding, directly applicable in all MS, no transposition (the AI Act, GDPR).",
          "DIRECTIVE: binding as to the result; MS transpose into national law (e.g. the proposed AI Liability Directive).",
          "DECISION: binding on those addressed. Recommendations/opinions: non-binding ('soft law').",
          "Standards (CEN/CENELEC): harmonised technical standards give a presumption of conformity.",
        ],
      },
      {
        heading: "Related EU digital rulebook",
        points: [
          "GDPR — personal data protection.",
          "Digital Services Act (DSA) — online platforms, illegal content, transparency.",
          "Digital Markets Act (DMA) — gatekeeper platforms, fair competition.",
          "Data Act & Data Governance Act — data sharing/reuse.",
          "Together with the AI Act, these form the EU's human-centric digital framework.",
        ],
      },
      {
        heading: "AI strategy milestones",
        points: [
          "2018: Commission AI strategy + Coordinated Plan on AI.",
          "2019: High-Level Expert Group Ethics Guidelines (7 requirements).",
          "2020: White Paper on AI.",
          "2021: AI Act proposed. 2024: AI Act adopted (Reg. 2024/1689).",
          "Goal framing: 'excellence and trust' in AI.",
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
      { front: "The three EU co-legislating / executive bodies?", back: "Commission (proposes/enforces), Parliament + Council (co-legislate)." },
      { front: "What does the CJEU do?", back: "Interprets EU law and ensures it's applied uniformly." },
      { front: "What do harmonised standards (CEN/CENELEC) provide?", back: "A presumption of conformity with the legal requirements." },
      { front: "Which guidelines defined the 7 Trustworthy-AI requirements?", back: "The High-Level Expert Group Ethics Guidelines (2019)." },
      { front: "EU AI policy slogan/framing?", back: "'Excellence and trust' — a human-centric approach to AI." },
    ],
  },
};
