# Next Steps

## Current status
- The `/ai-assistant` flow is working as a strong free document-analysis tool.
- Recent fixes:
- uploaded documents now persist across follow-up messages
- higher token budget for drafting responses
- custody/child-support knowledge routing improved
- `.doc` / `.docx` are no longer advertised as supported uploads
- The website dev server had external-drive / Turbopack filesystem issues; webpack dev mode was the workaround.

## Key product insight
- The next product gap is not basic upload.
- The next step is a deeper case-context workflow so the AI can use:
- uploaded court documents
- the user's own explanation of what is happening
- what they have already tried
- the obstacle they are currently facing
- the outcome they want

## Next step to resume with
Design the smallest strong "case context" feature for the website.

Questions to answer next:
1. Should this deeper-dive feature live inside `/ai-assistant` or in a separate signed-in case workspace?
2. What fields should the user be able to enter?
3. How should the AI combine uploaded documents + user narrative in the prompt?
4. What is the best build order to turn the free analyzer into the real product?

## Resume prompt
The current AI assistant works well for a free document-analysis version, but the next thing I need is a deeper case-context workflow.

I need a place where the user can explain:
- what is going on in plain English
- what they have already tried
- obstacles they are running into (for example, they cannot find a supervisor)
- what outcome they want

Then the AI should use BOTH:
1. uploaded court documents
2. the user’s written case context

Please inspect the current website and propose the smallest strong next implementation for this.

Tell me:
1. the best UX for this deeper-dive case-context feature
2. whether it should live inside /ai-assistant or as a separate signed-in case workspace
3. what fields the user should be able to enter
4. how the AI prompt should combine uploaded documents + user narrative
5. the best build order if we want this to become the real product, not just the free version

Do not code yet. Just design the feature and recommend the best next step.
