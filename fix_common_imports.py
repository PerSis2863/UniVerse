import glob
import re

files = [
    "apps/api/src/announcements/announcements.controller.ts",
    "apps/api/src/quizzes/quizzes.controller.ts",
    "apps/api/src/knowledge-hub/knowledge-hub.controller.ts"
]

for file in files:
    with open(file, 'r') as f:
        content = f.read()

    content = re.sub(r"from\s+'../auth/guards/jwt\.guard'", "from '../common/guards/jwt-auth.guard'", content)
    content = re.sub(r"from\s+'../auth/guards/roles\.guard'", "from '../common/guards/roles.guard'", content)
    content = re.sub(r"from\s+'../auth/decorators/roles\.decorator'", "from '../common/decorators/roles.decorator'", content)

    with open(file, 'w') as f:
        f.write(content)
