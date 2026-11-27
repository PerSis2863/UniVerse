/* Hyperion's 32-bit IBIS-AMI helper (M580). A 64-bit app can't load a 32-bit library, so for an older 32-bit model the
 * computer app starts this small 32-bit program, which loads the model, runs one session (AMI_Init, then AMI_GetWave
 * in blocks, then AMI_Close) and answers through its standard output. It reads one request from standard input:
 *   "AMI1", path (u32 length + UTF-8), parameters (u32 + text), rows (i32), aggressors (i32), dt, ui (f64),
 *   rows × (1 + aggressors) f64 impulse, wave length (u32) + f64 samples, block (u32)
 * and writes "AMR1", status (i32: 0 ok, 1 failed), error text, AMI_Init's return (i32), its output parameters and
 * message, whether GetWave exists (i32), the impulse back, the wave back, the clock times, GetWave's last parameters
 * (texts as u32 length + bytes, numbers little-endian, as both Windows and Linux on Intel are).
 * Build (desktop/hyperion/host32/build.sh): Linux gcc -m32 …; Windows i686-w64-mingw32-gcc … -static. */
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#ifdef _WIN32
#include <windows.h>
#include <fcntl.h>
#include <io.h>
#else
#include <dlfcn.h>
#endif

typedef long (*init_fn)(double *, long, long, double, double, char *, char **, void **, char **);
typedef long (*wave_fn)(double *, long, double *, char **, void *);
typedef long (*close_fn)(void *);

static void get(void *p, size_t n) { if (fread(p, 1, n, stdin) != n) exit(3); }
static uint32_t u32(void) { uint32_t v; get(&v, 4); return v; }
static char *text(void) { uint32_t n = u32(); if (n > (64u << 20)) exit(3); char *s = malloc(n + 1); get(s, n); s[n] = 0; return s; }
static void put(const void *p, size_t n) { fwrite(p, 1, n, stdout); }
static void pu32(uint32_t v) { put(&v, 4); }
static void pi32(int32_t v) { put(&v, 4); }
static void ptext(const char *s) { uint32_t n = s ? (uint32_t)strlen(s) : 0; pu32(n); if (n) put(s, n); }
static void fail(const char *why) {
  put("AMR1", 4); pi32(1); ptext(why); pi32(0); ptext(""); ptext(""); pi32(0); pu32(0); pu32(0); pu32(0); ptext("");
  fflush(stdout); exit(0);
}

int main(void) {
#ifdef _WIN32
  _setmode(_fileno(stdin), _O_BINARY); _setmode(_fileno(stdout), _O_BINARY);
#endif
  char magic[4]; get(magic, 4); if (memcmp(magic, "AMI1", 4)) exit(2);
  char *path = text(), *params = text();
  int32_t rows, agg; get(&rows, 4); get(&agg, 4);
  double dt, ui; get(&dt, 8); get(&ui, 8);
  if (rows < 1 || agg < 0 || agg > 16 || rows > 4000000) exit(3);
  size_t ni = (size_t)rows * (size_t)(1 + agg);
  double *imp = malloc(sizeof(double) * ni); get(imp, sizeof(double) * ni);
  uint32_t nw = u32(); if (nw > 4000000u) exit(3);
  double *wave = nw ? malloc(sizeof(double) * nw) : NULL; if (nw) get(wave, sizeof(double) * nw);
  uint32_t block = u32(); if (!block) block = nw ? nw : 1;

#ifdef _WIN32
  int wn = MultiByteToWideChar(CP_UTF8, 0, path, -1, NULL, 0);
  wchar_t *wpath = malloc(sizeof(wchar_t) * wn); MultiByteToWideChar(CP_UTF8, 0, path, -1, wpath, wn);
  HMODULE lib = LoadLibraryW(wpath);
  if (!lib) { char m[160]; snprintf(m, sizeof m, "The 32-bit model's library could not be loaded (Windows error %lu).", (unsigned long)GetLastError()); fail(m); }
  init_fn init = (init_fn)(void *)GetProcAddress(lib, "AMI_Init");
  wave_fn getwave = (wave_fn)(void *)GetProcAddress(lib, "AMI_GetWave");
  close_fn closef = (close_fn)(void *)GetProcAddress(lib, "AMI_Close");
#else
  void *lib = dlopen(path, RTLD_NOW | RTLD_LOCAL);
  if (!lib) { char m[512]; snprintf(m, sizeof m, "The 32-bit model's library could not be loaded: %s", dlerror()); fail(m); }
  init_fn init = (init_fn)dlsym(lib, "AMI_Init");
  wave_fn getwave = (wave_fn)dlsym(lib, "AMI_GetWave");
  close_fn closef = (close_fn)dlsym(lib, "AMI_Close");
#endif
  if (!init) fail("This library has no AMI_Init function: it is not an IBIS-AMI model.");

  char *pout = NULL, *msg = NULL; void *mem = NULL;
  long ret = init(imp, rows, agg, dt, ui, params, &pout, &mem, &msg);
  /* the model's strings stay valid until AMI_Close: copy them now */
  char *initParams = strdup(pout ? pout : ""), *initMsg = strdup(msg ? msg : "");
  double *clocks = NULL; uint32_t nc = 0; char *lastParams = strdup("");
  int status = ret != 0 ? 0 : 1; char err[160] = "";
  if (ret == 0) snprintf(err, sizeof err, "The model's AMI_Init refused%s%s.", initMsg[0] ? ": " : "", initMsg);
  else if (nw && getwave) {
    clocks = malloc(sizeof(double) * (nw + 1));
    double *clk = malloc(sizeof(double) * (block + 1));
    for (uint32_t at = 0; at < nw; at += block) {
      uint32_t len = nw - at < block ? nw - at : block; char *po = NULL;
      for (uint32_t k = 0; k <= len; k++) clk[k] = -1;
      if (getwave(wave + at, (long)len, clk, &po, mem) == 0) { status = 1; snprintf(err, sizeof err, "The model's AMI_GetWave refused at sample %u.", at); break; }
      for (uint32_t k = 0; k <= len && clk[k] >= 0; k++) clocks[nc++] = clk[k];
      if (po) { free(lastParams); lastParams = strdup(po); }
    }
    free(clk);
  }
  if (closef && mem) closef(mem);
  put("AMR1", 4); pi32(status); ptext(err); pi32((int32_t)ret); ptext(initParams); ptext(initMsg); pi32(getwave ? 1 : 0);
  pu32((uint32_t)ni); put(imp, sizeof(double) * ni);
  pu32(nw && getwave ? nw : 0); if (nw && getwave) put(wave, sizeof(double) * nw);
  pu32(nc); if (nc) put(clocks, sizeof(double) * nc);
  ptext(lastParams);
  fflush(stdout);
  return 0;
}
