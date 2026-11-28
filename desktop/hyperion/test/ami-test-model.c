/* A tiny IBIS-AMI model for Hyperion's tests (M577): a 2-tap feed-forward equaliser, its de-emphasis read from the
 * AMI parameter string as (tap -0.25). Init equalises the impulse response in place; GetWave filters the waveform
 * block by block (the memory keeps the last sample) and returns a clock time at the middle of each UI. Not a real
 * product's model. Build: gcc -shared -fPIC -O2 ami-test-model.c -o ami-test-model.so */
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
typedef struct { double tap; long spu; double last[256]; double ui, dt; double t; char out[256]; } Mem;
static double read_tap(const char *p) { const char *s = strstr(p ? p : "", "(tap "); return s ? atof(s + 5) : -0.2; }
long AMI_Init(double *imp, long rows, long agg, double dt, double ui, char *pin, char **pout, void **mem, char **msg) {
  (void)agg;
  Mem *m = calloc(1, sizeof(Mem));
  m->tap = read_tap(pin); m->spu = (long)(ui / dt + 0.5); m->ui = ui; m->dt = dt;
  if (m->spu < 1 || m->spu > 256) { *msg = "bad samples per UI"; free(m); return 0; }
  double *c = malloc(sizeof(double) * rows);
  for (long i = 0; i < rows; i++) c[i] = (1 + m->tap) * imp[i] + (i >= m->spu ? m->tap * imp[i - m->spu] : 0); /* main + post */
  /* normalise so |main| + |post| = 1 */
  double k = 1.0 / (1 + 2 * (m->tap < 0 ? -m->tap : m->tap));
  for (long i = 0; i < rows; i++) imp[i] = c[i] * k;
  free(c);
  snprintf(m->out, sizeof m->out, "(test_tx (tap %g))", m->tap);
  *pout = m->out; *mem = m; *msg = "Hyperion test model ready";
  return 1;
}
long AMI_GetWave(double *wave, long n, double *clock, char **pout, void *mem) {
  Mem *m = mem; double k = 1.0 / (1 + 2 * (m->tap < 0 ? -m->tap : m->tap));
  double *orig = malloc(sizeof(double) * n); memcpy(orig, wave, sizeof(double) * n);
  for (long i = 0; i < n; i++) {
    double prev = i >= m->spu ? orig[i - m->spu] : m->last[i];
    wave[i] = k * ((1 + m->tap) * orig[i] + m->tap * prev);
  }
  for (long i = 0; i < m->spu && i < n; i++) m->last[i] = orig[n - m->spu + i];
  long c = 0;
  for (long i = 0; i < n; i += m->spu) clock[c++] = m->t + (i + m->spu / 2) * m->dt;
  clock[c] = -1;
  m->t += n * m->dt;
  *pout = m->out;
  return 1;
}
long AMI_Close(void *mem) { free(mem); return 1; }
