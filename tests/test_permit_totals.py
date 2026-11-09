import json
import subprocess
from pathlib import Path


def test_permit_totals_are_aggregated_across_campus():
    module = Path(__file__).parents[1] / "app" / "static" / "permit-totals.js"
    script = f"""
    import {{ aggregatePermitTypes }} from {json.dumps(str(module))};

    const structures = [
      {{
        availability: [
          {{ type: "A", open: 10, total: 20 }},
          {{ type: "B", open: 3, total: 17 }},
        ],
      }},
      {{
        availability: [
          {{ type: "A", open: 5, total: 30 }},
          {{ type: "Visitor", open: 2, total: 4 }},
        ],
      }},
    ];

    const totals = aggregatePermitTypes(structures);
    const expected = [
      {{ type: "A", open: 15, total: 50 }},
      {{ type: "B", open: 3, total: 17 }},
      {{ type: "Visitor", open: 2, total: 4 }},
    ];

    if (JSON.stringify(totals) !== JSON.stringify(expected)) {{
      throw new Error(`Unexpected totals: ${{JSON.stringify(totals)}}`);
    }}
    """
    subprocess.run(["node", "--input-type=module", "-e", script], check=True)
