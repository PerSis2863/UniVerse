/* A tiny back-channel (BCI) model pair for Hyperion's tests (M579), one library for both ends: (role tx) is a 2-tap
 * FFE that reads its tap from the file <BCI_ID>.rx2tx when the receiver has written one; (role rx) passes the wave
 * through (reporting the highest voltage it has seen), gives a clock per UI, and on its second AMI_GetWave call asks the transmitter for tap -0.35 by writing that
 * file in the working directory (the shared folder the EDA tool runs both in). Not a real product's model.
 * Build: gcc -shared -fPIC -O2 ami-test-bci.c -o ami-test-bci.so */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
typedef struct { int rx; double tap, peak; long spu; double t, dt; long calls; char id[128]; double last[256]; char out[256]; } Mem;
static void word(const char *p, const char *key, char *dst, size_t n) {
  const char *s = strstr(p ? p : "", key); dst[0] = 0; if (!s) return; s += strlen(key);
  while (*s == ' ' || *s == '"') s++;
  size_t i = 0; while (s[i] && s[i] != ')' && s[i] != '"' && s[i] != ' ' && i + 1 < n) { dst[i] = s[i]; i++; } dst[i] = 0;
}
long AMI_Init(double *imp, long rows, long agg, double dt, double ui, char *pin, char **pout, void **mem, char **msg) {
  (void)imp; (void)rows; (void)agg;
  Mem *m = calloc(1, sizeof(Mem)); char buf[64];
  word(pin, "(role ", buf, sizeof buf); m->rx = strcmp(buf, "rx") == 0;
  word(pin, "(tap ", buf, sizeof buf); m->tap = buf[0] ? atof(buf) : -0.1;
  word(pin, "(BCI_ID ", m->id, sizeof m->id);
  m->spu = (long)(ui / dt + 0.5); m->dt = dt;
  if (!m->id[0]) { *msg = "no BCI_ID given"; free(m); return 0; }
  snprintf(m->out, sizeof m->out, "(test_bci (tap %g))", m->tap);
  *pout = m->out; *mem = m; *msg = m->rx ? "bci rx ready" : "bci tx ready";
  return 1;
}
long AMI_GetWave(double *wave, long n, double *clock, char **pout, void *mem) {
  Mem *m = mem; char name[160]; snprintf(name, sizeof name, "%s.rx2tx", m->id);
  m->calls++;
  if (m->rx) {
    if (m->calls == 2) { FILE *f = fopen(name, "w"); if (f) { fprintf(f, "tap -0.35\n"); fclose(f); } }
    for (long i = 0; i < n; i++) if (wave[i] > m->peak) m->peak = wave[i];
    long c = 0; for (long i = 0; i < n; i += m->spu) clock[c++] = m->t + (i + m->spu / 2) * m->dt; clock[c] = -1;
  } else {
    FILE *f = fopen(name, "r"); if (f) { double v; if (fscanf(f, "tap %lf", &v) == 1) m->tap = v; fclose(f); }
    double k = 1.0 / (1 + 2 * (m->tap < 0 ? -m->tap : m->tap));
    double *orig = malloc(sizeof(double) * n); memcpy(orig, wave, sizeof(double) * n);
    for (long i = 0; i < n; i++) wave[i] = k * ((1 + m->tap) * orig[i] + m->tap * (i >= m->spu ? orig[i - m->spu] : m->last[i]));
    for (long i = 0; i < m->spu && i < n; i++) m->last[i] = orig[n - m->spu + i];
    free(orig);
    clock[0] = -1;
  }
  m->t += n * m->dt;
  if (m->rx) snprintf(m->out, sizeof m->out, "(test_bci (peak %.6f))", m->peak); else snprintf(m->out, sizeof m->out, "(test_bci (tap %g))", m->tap);
  *pout = m->out;
  return 1;
}
long AMI_Close(void *mem) { free(mem); return 1; }
