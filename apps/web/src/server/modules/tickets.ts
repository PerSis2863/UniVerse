import type { Router } from '../router';
import { TicketsService } from '../services/tickets.service';
import { CreateTicketDto, validate } from '../dto';

const tickets = new TicketsService();

export default function ticketsModule(router: Router) {
  const r = router.controller('tickets');

  r.post('', ({ user, body }) => tickets.create(user.id, validate<CreateTicketDto>(CreateTicketDto, body)));
  r.get('', ({ user }) => tickets.findAll(user.id));
}
