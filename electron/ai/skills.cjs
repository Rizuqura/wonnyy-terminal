// This registry describes app-owned capabilities, never document-supplied tools.
const SKILLS = Object.freeze({
  "knowledge-consolidation": Object.freeze({
    id: "knowledge-consolidation",
    agentId: "wonnyy-agent",
    mode: "reviewed-proposals",
    loopIntegration: "unavailable",
  }),
});
const skillsFor = (agentId) =>
  Object.values(SKILLS)
    .filter((skill) => skill.agentId === agentId)
    .map((skill) => skill.id);
module.exports = { SKILLS, skillsFor };
