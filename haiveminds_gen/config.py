"""
Configuration and matrix rotation data for the haiveminds message tree generator.

Target tree shape (breadth-first, 14 children per node):
  Level 0 (root):            1 node
  Level 1:                  14 nodes   (14^1)
  Level 2:                 196 nodes   (14^2)
  Level 3:               2,744 nodes   (14^3)
  Level 4:              38,416 nodes   (14^4)
  ------------------------------------------------
  Subtotal levels 0-4:   41,371 nodes
  Level 5 (remainder):   11,115 nodes  (partial expansion of level 4 nodes)
  ------------------------------------------------
  TOTAL:                 52,486 nodes

NOTE: 11,115 / 14 is not an integer (794 parents * 14 = 11,116, one too many).
The remainder script expands 794 level-4 parents, but only inserts 13 children
for the final parent so the grand total lands exactly on TOTAL_TARGET.
"""
import os
from dotenv import load_dotenv

load_dotenv()

# --- API ---
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")

# --- Tree shape ---
BRANCHING_FACTOR = 14
TOTAL_TARGET = 52_486
LEVEL_SIZES = {0: 1, 1: 14, 2: 196, 3: 2744, 4: 38416}
LEVEL5_TARGET = TOTAL_TARGET - sum(LEVEL_SIZES.values())  # 11,115
LEVEL5_PARENTS_NEEDED = -(-LEVEL5_TARGET // BRANCHING_FACTOR)  # ceil -> 794

# --- Generation robustness ---
REQUEST_DELAY_SECONDS = float(os.environ.get("REQUEST_DELAY_SECONDS", "2.0"))
MAX_RETRIES_PER_CALL = 5
BATCH_PROGRESS_EVERY = 25

# Max number of parent-node expansions in flight at the same time (async, not OS threads).
# 1000 concurrent requests is aggressive against most API quotas/rate limits -- expect a
# wave of 429s that the per-call retry/backoff will absorb, but throughput is bounded by
# your actual quota, not by this number.
CONCURRENCY = int(os.environ.get("CONCURRENCY", "1000"))

# --- Database ---
DB_PATH = os.environ.get("HAIVEMINDS_DB_PATH", os.path.join(os.path.dirname(__file__), "..", "haiveminds.db"))

# --- Guardrails ---
BANNED_WORDS = ["agentic", "modules", "module", "agent", "agents"]
MIN_WORDS = 5
MAX_WORDS = 10

# --- Matrix rotation variables ---
# Rotated deterministically per-node (based on node id) to keep messages
# diverse across the tree instead of repeating the same 3 variables.
INDUSTRIES = [
    "Financial Services", "Healthcare", "Manufacturing", "Retail",
    "Energy & Utilities", "Telecommunications", "Insurance", "Logistics",
    "Public Sector", "Aerospace & Defense", "Pharmaceuticals", "Automotive",
    "Media & Entertainment", "Global Trade",
]

BUSINESS_FUNCTIONS = [
    "Finance & Treasury", "Human Resources", "Supply Chain", "Sales Operations",
    "Customer Service", "IT Operations", "Legal & Compliance", "Marketing",
    "Procurement", "Research & Development", "Risk Management",
    "Product Management", "Security Operations", "Data Governance",
]

TECHNICAL_ASPECTS = [
    "Data Integration", "Workflow Orchestration", "Predictive Analytics",
    "Identity Management", "API Governance", "Cloud Infrastructure",
    "Real-Time Monitoring", "Process Automation", "Knowledge Graphs",
    "Compliance Auditing", "Elastic Scalability", "System Interoperability",
    "Observability", "Security Posture",
]


def rotate_matrix(node_id: int) -> tuple[str, str, str]:
    """Deterministically rotate the 3 matrix variables based on a node id
    so every API call gets a different combination."""
    industry = INDUSTRIES[node_id % len(INDUSTRIES)]
    function = BUSINESS_FUNCTIONS[(node_id // len(INDUSTRIES)) % len(BUSINESS_FUNCTIONS)]
    aspect = TECHNICAL_ASPECTS[(node_id // 7) % len(TECHNICAL_ASPECTS)]
    return industry, function, aspect
