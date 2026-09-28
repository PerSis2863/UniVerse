import type { Router } from '../router';
import { BlackboardService } from '../services/blackboard.service';

const blackboard = new BlackboardService();

export default function blackboardModule(router: Router) {
  const r = router.controller('blackboard');

  r.get<{ courseId: string }>(':courseId', ({ params, user }) => blackboard.getBlackboardData(params.courseId, user.id, user.role));
}
