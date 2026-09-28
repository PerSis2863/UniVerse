import type { Router } from '../router';
import { PartnersService } from '../services/partners.service';

const partners = new PartnersService();

export default function partnersModule(router: Router) {
  const r = router.controller('partners');

  r.get('', () => partners.findAll());
  r.get('partnerships', () => partners.getPartnerships());
  r.get<{ id: string }>(':id', ({ params }) => partners.findOne(params.id));
  r.post('', { roles: ['ADMIN'] }, ({ body }) => partners.create(body));
  r.patch<{ id: string }>(':id', { roles: ['ADMIN'] }, ({ params, body }) => partners.update(params.id, body));
  r.post('partnerships', { roles: ['ADMIN'] }, ({ body }) => partners.createPartnership(body));
}
