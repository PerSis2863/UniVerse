// Hyperion's help (M391): a line for every function, grouped as a person looks for them. `help name` and `doc
// name` print it, the editor shows it beside suggestions and on hover, the function browser lists it. Written for
// this Lab (what our own functions do), in plain words.

const TEXT = `
# Numbers and arithmetic
abs | abs(x) | Absolute value; the size of a complex number.
sign | sign(x) | −1, 0 or 1 by the sign of each number.
sqrt | sqrt(x) | Square root (complex for negative numbers).
exp | exp(x) | e to the power x.
expm1 | expm1(x) | exp(x) − 1, accurate for small x.
log | log(x) | Natural logarithm (complex for negative numbers).
log10 | log10(x) | Logarithm to base 10.
log2 | log2(x) | Logarithm to base 2.
log1p | log1p(x) | log(1 + x), accurate for small x.
power | power(a, b) | a .^ b, element by element.
plus | plus(a, b) | a + b.
minus | minus(a, b) | a − b.
times | times(a, b) | a .* b, element by element.
rdivide | rdivide(a, b) | a ./ b, element by element.
mtimes | mtimes(A, B) | Matrix product A * B.
mldivide | mldivide(A, b) | Solves A x = b (A \\ b).
linsolve | linsolve(A, b) | Solves A x = b, as A \\ b.
round | round(x) | Nearest whole number (halves away from zero).
floor | floor(x) | Round down.
ceil | ceil(x) | Round up.
fix | fix(x) | Round towards zero.
mod | mod(a, m) | Remainder after division, with the sign of m.
rem | rem(a, m) | Remainder after division, with the sign of a.
idivide | idivide(a, b, how) | Whole-number division: 'fix', 'round', 'floor' or 'ceil'.
gcd | gcd(a, b) | Greatest common divisor.
lcm | lcm(a, b) | Least common multiple.
factorial | factorial(n) | n! (1 · 2 · … · n).
nchoosek | nchoosek(n, k) | Ways to choose k of n.
primes | primes(n) | The primes up to n.
isprime | isprime(n) | True for prime numbers.
gamma | gamma(x) | The gamma function (factorial(n − 1) for whole n).
erf | erf(x) | The error function.
erfc | erfc(x) | 1 − erf(x).
hypot | hypot(a, b) | sqrt(a² + b²) without overflow.
real | real(z) | Real part.
imag | imag(z) | Imaginary part.
conj | conj(z) | Complex conjugate.
angle | angle(z) | Phase angle of a complex number (radians).
arg | arg(z) | Same as angle.
complex | complex(a, b) | a + b i.
iscomplex | iscomplex(x) | True when x has imaginary parts.
isreal | isreal(x) | True when x has no imaginary parts.
i | i | The imaginary unit (also j, 3i, 2.5j).
j | j | The imaginary unit.
pi | pi | 3.14159…
e | e | 2.71828…
Inf | Inf | Infinity (also inf).
inf | inf | Infinity.
NaN | NaN | Not a number (also nan, NA).
nan | nan | Not a number.
NA | NA | Not a number.
eps | eps, eps(x) | The gap between 1 (or x) and the next number.
realmax | realmax | The largest number.
realmin | realmin | The smallest normal positive number.
flintmax | flintmax | The largest whole number held exactly (2^53).
intmax | intmax('int32') | The largest value of a whole-number type.
intmin | intmin('int32') | The smallest value of a whole-number type.
deg2rad | deg2rad(d) | Degrees to radians.
rad2deg | rad2deg(r) | Radians to degrees.

# Trigonometry
sin | sin(x) | Sine (radians).
cos | cos(x) | Cosine (radians).
tan | tan(x) | Tangent (radians).
sec | sec(x) | Secant, 1 / cos(x).
csc | csc(x) | Cosecant, 1 / sin(x).
cot | cot(x) | Cotangent, 1 / tan(x).
asin | asin(x) | Inverse sine.
acos | acos(x) | Inverse cosine.
atan | atan(x) | Inverse tangent.
atan2 | atan2(y, x) | Angle of the point (x, y), from −π to π.
sinh | sinh(x) | Hyperbolic sine.
cosh | cosh(x) | Hyperbolic cosine.
tanh | tanh(x) | Hyperbolic tangent.
asinh | asinh(x) | Inverse hyperbolic sine.
acosh | acosh(x) | Inverse hyperbolic cosine.
atanh | atanh(x) | Inverse hyperbolic tangent.
sind | sind(x) | Sine of degrees.
cosd | cosd(x) | Cosine of degrees.
tand | tand(x) | Tangent of degrees.
asind | asind(x) | Inverse sine, in degrees.
acosd | acosd(x) | Inverse cosine, in degrees.
atand | atand(x) | Inverse tangent, in degrees.

# Making matrices
zeros | zeros(r, c), zeros(r, c, p, …, 'uint8') | All zeros.
ones | ones(r, c) | All ones.
eye | eye(n), eye(r, c) | The identity matrix.
rand | rand(r, c) | Random numbers between 0 and 1.
randn | randn(r, c) | Random numbers from the normal distribution.
randi | randi(max, r, c), randi([lo hi], r, c) | Random whole numbers.
rng | rng(seed), rng('default'), rng('shuffle') | Sets where random numbers start (the same seed, the same numbers); 'shuffle' makes them unrepeatable again.
randperm | randperm(n), randperm(n, k) | The numbers 1 to n in a random order (or k of them).
true | true(r, c) | Logical ones.
false | false(r, c) | Logical zeros.
linspace | linspace(a, b, n) | n evenly spaced numbers from a to b (100 by default).
logspace | logspace(a, b, n) | n numbers from 10^a to 10^b, spaced evenly on a log scale.
colon | colon(a, step, b) | a:step:b.
magic | magic(n) | A magic square (rows, columns and diagonals with the same sum).
repmat | repmat(A, r, c) | A repeated r times down and c times across.
reshape | reshape(A, r, c, …) | The same numbers in a new shape ([] for one size to work out).
cat | cat(dim, A, B, …) | Joins arrays along a dimension (3 for pages, 4…).
horzcat | horzcat(A, B) | [A B].
vertcat | vertcat(A, B) | [A; B].
meshgrid | [X, Y] = meshgrid(x, y), [X, Y, Z] = meshgrid(x, y, z) | Grids of coordinates (x across, y down).
ndgrid | [X, Y] = ndgrid(x, y) | Grids of coordinates (x down, y across).
diag | diag(v), diag(A) | A matrix with v on its diagonal, or A's diagonal.
tril | tril(A, k) | The lower triangle.
triu | triu(A, k) | The upper triangle.
kron | kron(A, B) | Kronecker product.
blanks | blanks(n) | n spaces.
peaks | peaks(n), [X, Y, Z] = peaks(n) | A sample surface with peaks and valleys.

# Size and type
size | size(A), size(A, dim), [r, c] = size(A) | The sizes of every dimension.
numel | numel(A) | How many elements.
length | length(A) | The largest size.
ndims | ndims(A) | How many dimensions.
isempty | isempty(A) | True when A has no elements.
isscalar | isscalar(A) | True for one number.
isvector | isvector(A) | True for a row or a column.
isrow | isrow(A) | True for one row.
iscolumn | iscolumn(A) | True for one column.
ismatrix | ismatrix(A) | True for up to two dimensions.
issquare | issquare(A) | True when rows = columns.
class | class(x) | The type: double, single, int8 … uint64, logical, char, cell, struct, table, function_handle.
isa | isa(x, 'numeric') | True when x is that type ('numeric', 'float', 'integer', or a type's name).
isnumeric | isnumeric(x) | True for numbers.
isfloat | isfloat(x) | True for double or single.
isinteger | isinteger(x) | True for int8 … uint64.
islogical | islogical(x) | True for true / false values.
ischar | ischar(x) | True for text.
iscell | iscell(x) | True for a cell array.
iscellstr | iscellstr(x) | True for a cell array of texts.
isstruct | isstruct(x) | True for a struct.
istable | istable(x) | True for a table.
is_function_handle | is_function_handle(f) | True for a function handle.
isfield | isfield(s, 'name') | True when the struct has that field.
isvarname | isvarname('text') | True when the text can be a variable's name.
double | double(x) | As ordinary numbers (also turns text into its character codes).
single | single(x) | As single-precision numbers.
int8 | int8(x) | As whole numbers from −128 to 127 (rounded, held at the ends).
int16 | int16(x) | As whole numbers from −32768 to 32767.
int32 | int32(x) | As 32-bit whole numbers.
int64 | int64(x) | As 64-bit whole numbers.
uint8 | uint8(x) | As whole numbers from 0 to 255 (pictures use these).
uint16 | uint16(x) | As whole numbers from 0 to 65535.
uint32 | uint32(x) | As whole numbers from 0 to 4294967295.
uint64 | uint64(x) | As 64-bit whole numbers 0 or more.
cast | cast(x, 'type') | As another type.
logical | logical(x) | As true / false (0 is false).
char | char(x), char(c1, c2) | As text (numbers are character codes; several make rows).
isfinite | isfinite(x) | True for numbers that aren't Inf or NaN.
isinf | isinf(x) | True for Inf and −Inf.
isnan | isnan(x) | True for NaN.

# Linear algebra
inv | inv(A) | The inverse of a square matrix (A \\ b is better for solving).
pinv | pinv(A) | The pseudo-inverse (least squares).
det | det(A) | The determinant.
rank | rank(A) | How many independent rows.
trace | trace(A) | The sum of the diagonal.
norm | norm(v), norm(A, p) | Length of a vector, size of a matrix (2, 1, Inf, 'fro').
eig | eig(A), [V, D] = eig(A) | Eigenvalues (and eigenvectors).
lu | [L, U, P] = lu(A) | LU factorisation.
cross | cross(a, b) | Cross product of 3-vectors.
dot | dot(a, b) | Dot product.
transpose | transpose(A) | A.' (rows become columns).
ctranspose | ctranspose(A) | A' (transpose and conjugate).

# Sums, statistics and distributions
sum | sum(A), sum(A, dim) | Sum down columns (or along dim; 3 for pages).
prod | prod(A, dim) | Product.
cumsum | cumsum(A, dim) | Running sum.
cumprod | cumprod(A, dim) | Running product.
cummax | cummax(A) | Running maximum.
cummin | cummin(A) | Running minimum.
mean | mean(A, dim) | Average.
median | median(A, dim) | Middle value.
mode | mode(A) | Most frequent value.
std | std(A, w, dim) | Standard deviation (w = 1 divides by n).
var | var(A, w, dim) | Variance.
min | min(A), min(A, B), [m, i] = min(A) | Smallest (and where).
max | max(A), max(A, B), [m, i] = max(A) | Largest (and where).
bounds | [lo, hi] = bounds(A) | Smallest and largest.
range | range(x) | Largest minus smallest.
prctile | prctile(x, p) | Percentiles.
quantile | quantile(x, q) | Quantiles (q from 0 to 1).
iqr | iqr(x) | Interquartile range (75th minus 25th percentile).
zscore | zscore(x) | Standardised: mean 0, standard deviation 1.
skewness | skewness(x) | How lopsided the values are.
kurtosis | kurtosis(x) | How heavy the tails are (3 for normal).
cov | cov(x, y), cov(A) | Covariance.
corrcoef | corrcoef(x, y) | Correlation coefficients (a 2 × 2 matrix for two vectors).
corr | corr(x, y) | Correlation between columns.
histcounts | [n, edges] = histcounts(x, nbins) | Counts per bin.
histc | histc(x, edges) | Counts per edge (older form of histcounts).
normpdf | normpdf(x, mu, sigma) | Normal distribution's density.
normcdf | normcdf(x, mu, sigma) | Normal distribution's cumulative probability.
norminv | norminv(p, mu, sigma) | Value with cumulative probability p.
exppdf | exppdf(x, mu) | Exponential distribution's density.
unifpdf | unifpdf(x, a, b) | Uniform distribution's density.
movmean | movmean(x, k) | Moving average over k neighbours.
movsum | movsum(x, k) | Moving sum.
movmax | movmax(x, k) | Moving maximum.
movmin | movmin(x, k) | Moving minimum.
movmedian | movmedian(x, k) | Moving median.

# Sorting, finding and sets
sort | sort(A), sort(A, 'descend'), [s, i] = sort(A) | Sorted (and the original positions).
sortrows | sortrows(A, col), sortrows(T, 'name', 'descend') | Rows sorted by a column (matrices and tables).
unique | unique(x), [u, i, j] = unique(x) | The different values, sorted.
ismember | ismember(a, set) | True where a's values are in the set.
intersect | intersect(a, b) | The values in both, sorted (numbers or text in cells).
union | union(a, b) | The values in either, sorted, each once.
setdiff | setdiff(a, b) | The values of a that aren't in b, sorted.
find | find(x), [r, c] = find(A) | Where the true (non-zero) values are.
ind2sub | [r, c] = ind2sub(size(A), k) | Turns linear indices into row and column (and page…) numbers.
sub2ind | k = sub2ind(size(A), r, c) | Turns row and column (and page…) numbers into linear indices.
nnz | nnz(x) | How many non-zero values.
any | any(x, dim) | True when any value is true.
all | all(x, dim) | True when every value is true.
and | and(a, b) | a & b.
or | or(a, b) | a | b.
xor | xor(a, b) | True when exactly one is true.
not | not(a) | ~a.
flip | flip(A), flip(A, dim) | Reversed along the first dimension longer than 1 (or dim).
fliplr | fliplr(A) | Columns in reverse order.
flipud | flipud(A) | Rows in reverse order.
circshift | circshift(A, k) | Shifted round by k places.
permute | permute(A, order) | Dimensions in a new order (any number of them).
ipermute | ipermute(A, order) | Undoes permute.
squeeze | squeeze(A) | Drops dimensions of size 1.
isequal | isequal(a, b) | True when they hold the same values.

# Calculus, polynomials and equations
polyfit | p = polyfit(x, y, n) | Polynomial of degree n through the points (least squares).
polyval | polyval(p, x) | A polynomial's values.
polyder | polyder(p) | A polynomial's derivative.
polyint | polyint(p) | A polynomial's integral.
roots | roots(p) | A polynomial's roots (complex too).
conv | conv(a, b) | Convolution (multiplies polynomials).
deconv | [q, r] = deconv(a, b) | Divides polynomials.
interp1 | interp1(x, y, xq, method) | Values between points ('linear', 'nearest', 'spline').
spline | spline(x, y, xq) | Cubic spline through the points.
trapz | trapz(x, y) | Area under the points (trapezoids).
cumtrapz | cumtrapz(x, y) | Running area.
integral | integral(f, a, b) | Integral of a function from a to b.
quad | quad(f, a, b) | Integral (older name).
quadgk | quadgk(f, a, b) | Integral (older name).
fzero | [x, fval, flag, output] = fzero(f, x0, options) | Where f is zero, near x0 (or between [a b]), by Brent's method: safe bisection with faster interpolation steps. A single x0 is widened until the sign changes. A complex x0 (fzero(@(z) z^2 + 4, 1i)) finds a complex root by Muller's method.
fminbnd | [x, fval, flag, output] = fminbnd(f, a, b, options) | Where f is smallest between a and b, by Brent's method (golden sections and parabolas; options TolX, 1e-4 by default).
ode45 | [t, y] = ode45(f, [t0 t1], y0) | Solves y' = f(t, y) (Dormand–Prince, adaptive steps).
ode23 | [t, y] = ode23(f, [t0 t1], y0) | Solves y' = f(t, y) (lower order, for rougher problems).
gradient | gradient(F, h), [fx, fy] = gradient(F) | Slopes on a grid; gradient(f, [x, y]) of a formula: its derivatives by each letter.
del2 | del2(F, h) | The discrete Laplacian (/ 4, as MATLAB).
divergence | divergence(X, Y, U, V) | Divergence of a 2D field.
curl | curl(X, Y, U, V) | Turning of a 2D field.

# Signals
fft | fft(x, n), fft(A) | Fourier transform (any length).
ifft | ifft(X) | Inverse Fourier transform.
fftshift | fftshift(X) | Puts the zero frequency in the middle.
ifftshift | ifftshift(X) | Undoes fftshift.
nextpow2 | nextpow2(n) | The next power of 2's exponent.
filter | filter(b, a, x) | Runs x through a digital filter.
conv2 | conv2(A, K, 'same') | 2D convolution.
xcorr | [r, lags] = xcorr(x, y) | Cross-correlation.
hann | hann(n) | Hann window.
hanning | hanning(n) | Hann window (older name).
hamming | hamming(n) | Hamming window.
blackman | blackman(n) | Blackman window.
rectwin | rectwin(n) | Rectangular window.
freqz | [h, w] = freqz(b, a, n, fs) | A filter's frequency response at n points (512); drawn (magnitude in dB and phase) without outputs. Takes a designfilt filter too: freqz(d).
butter | [b, a] = butter(n, Wn, 'high') | Butterworth filter of order n: flattest passband; Wn the −3 dB edge (1 = half the sample rate), two edges for a band ('bandpass', 'stop'); [z, p, k] with three outputs; 's' designs an analog one (Wn in rad/s).
cheby1 | [b, a] = cheby1(n, Rp, Wp, type) | Chebyshev type I: ripple of Rp dB in the passband for a sharper edge at Wp.
cheby2 | [b, a] = cheby2(n, Rs, Ws, type) | Chebyshev type II: flat passband, at least Rs dB down from the stopband edge Ws.
ellip | [b, a] = ellip(n, Rp, Rs, Wp, type) | Elliptic (Cauer) filter: Rp dB ripple in the passband, Rs dB down in the stopband; the sharpest edge for its order.
buttord | [n, Wn] = buttord(Wp, Ws, Rp, Rs) | The smallest Butterworth order that keeps the passband within Rp dB and the stopband Rs dB down.
cheb1ord | [n, Wp] = cheb1ord(Wp, Ws, Rp, Rs) | The smallest Chebyshev I order for the specification.
cheb2ord | [n, Ws] = cheb2ord(Wp, Ws, Rp, Rs) | The smallest Chebyshev II order for the specification.
ellipord | [n, Wp] = ellipord(Wp, Ws, Rp, Rs) | The smallest elliptic order for the specification.
fir1 | b = fir1(n, Wn, 'high', win) | Windowed-sinc FIR filter of order n (Hamming window unless given); high-pass and band-stop need an even n.
fir2 | b = fir2(n, f, m) | FIR filter by frequency sampling: gains m at frequencies f (0 … 1, a repeated f makes a jump).
firpm | [b, err] = firpm(n, f, a, w) | Equiripple FIR (Parks–McClellan): bands as edge pairs f, gains a at each edge, a weight per band; err is the ripple.
grpdelay | [gd, w] = grpdelay(b, a, n, fs) | Group delay in samples; drawn without outputs.
filtfilt | y = filtfilt(b, a, x) | Filters forwards and backwards: no phase shift, the magnitude response squared. Takes a designfilt filter too.
designfilt | d = designfilt('lowpassiir', 'FilterOrder', 8, 'HalfPowerFrequency', 0.2) | Designs a filter from a description ('lowpassfir', 'bandstopiir'…; 'PassbandFrequency', 'StopbandFrequency', 'PassbandRipple', 'StopbandAttenuation', 'CutoffFrequency', 'DesignMethod', 'SampleRate'); a struct that filter, filtfilt, freqz and grpdelay take.
pwelch | [pxx, f] = pwelch(x, window, noverlap, nfft, fs) | Welch's power spectral density (averaged, windowed periodograms); drawn without outputs.
spectrogram | [s, f, t, p] = spectrogram(x, window, noverlap, nfft, fs) | The short-time Fourier transform: how the spectrum changes over time; drawn as a picture without outputs.

# Test and measurement
audioread | [y, fs] = audioread('take.wav', [first last]) | Reads a WAV file from Hyperion's files: one column per channel, −1 … 1, and its sample rate (Signals → Audio records them).
audiowrite | audiowrite('out.wav', y, fs, 'BitsPerSample', 24) | Writes a WAV file (8, 16, 24 or 32-bit; 64 for floats); one column per channel.
audioinfo | info = audioinfo('take.wav') | A WAV file's sample rate, channels, length and bits.
sound | sound(y, fs) | Plays samples (−1 … 1) through the speakers.
soundsc | soundsc(y, fs) | Plays samples scaled so the loudest is full volume.
thd | r = thd(x, fs, n) | Total harmonic distortion in dB against the fundamental (harmonics 2 … n, 6 unless given).

# Hardware: serial devices and Arduino
serialportlist | serialportlist | The device connected in Signals → Devices (a real port or the simulated Arduino), as a cell of names.
serialport | s = serialport(port, baudrate) | The serial device connected in Signals → Devices (connect it there first: browsers let only the page open ports).
readline | line = readline(s) | The next line the device sent that the script hasn't read yet (empty when none: a script sees what arrived before it started).
writeline | writeline(s, 'LED ON') | Sends text and a new line to the device.
write | write(s, data, 'uint8') | Sends bytes (or 'string' text) to the device.
flush | flush(s) | Forgets the lines not read yet.
arduino | a = arduino() | The Arduino connected in Signals → Devices in Firmata mode (StandardFirmata uploaded), with its pins.
configurePin | configurePin(a, 'D13', 'DigitalOutput') | Sets a pin's mode: 'DigitalOutput', 'DigitalInput', 'AnalogInput', 'PWM', 'Pullup' or 'Servo'; without a mode, says it.
writeDigitalPin | writeDigitalPin(a, 'D13', 1) | Switches a digital pin high (1) or low (0).
readDigitalPin | v = readDigitalPin(a, 'D2') | A digital pin's level, 0 or 1 (its last report before the script started).
readVoltage | v = readVoltage(a, 'A0') | An analog pin's voltage, 0 to 5 V (10 bits).
writePWMDutyCycle | writePWMDutyCycle(a, 'D9', 0.5) | PWM on a pin: the share of time it is on, 0 to 1.
writePWMVoltage | writePWMVoltage(a, 'D9', 2.5) | PWM on a pin as an average voltage, 0 to 5 V.

# Text
sprintf | sprintf(format, …) | Formatted text (%d %f %.2f %s %e %g %x %%).
fprintf | fprintf(format, …), fprintf(fid, format, …) | Prints formatted text (or writes it to a file).
printf | printf(format, …) | Same as fprintf.
disp | disp(x) | Shows a value.
display | display(x) | Shows a value.
num2str | num2str(x, digits) | A number as text.
int2str | int2str(x) | A rounded number as text.
mat2str | mat2str(A) | A matrix as text you could type back in.
str2num | str2num(t) | Text to numbers.
str2double | str2double(t) | Text to a number (NaN when it isn't one).
strcat | strcat(a, b, …) | Joins texts.
strcmp | strcmp(a, b) | True when texts are equal.
strcmpi | strcmpi(a, b) | Equal, ignoring capitals.
strncmp | strncmp(a, b, n) | First n characters equal.
strncmpi | strncmpi(a, b, n) | First n equal, ignoring capitals.
strfind | strfind(text, pattern) | Where the pattern starts.
strrep | strrep(text, old, new) | Replaces every old with new.
strsplit | strsplit(text, delimiter) | Splits into a cell of pieces.
strjoin | strjoin(c, delimiter) | Joins a cell of texts.
strtrim | strtrim(text) | Without spaces at the ends.
upper | upper(t) | Capitals.
lower | lower(t) | Small letters.
toupper | toupper(t) | Capitals.
tolower | tolower(t) | Small letters.
regexp | regexp(text, pattern, 'match') | Regular-expression search ('match', 'tokens', 'start', 'names', 'split').
regexprep | regexprep(text, pattern, new) | Regular-expression replace.
isletter | isletter(t) | True for letters.
isalpha | isalpha(t) | True for letters.
isdigit | isdigit(t) | True for digits.
isspace | isspace(t) | True for spaces, tabs and new lines.
dec2bin | dec2bin(n, width) | A number in binary.
bin2dec | bin2dec('1010') | Binary to a number.
dec2hex | dec2hex(n) | A number in hexadecimal.
hex2dec | hex2dec('FF') | Hexadecimal to a number.
bitand | bitand(a, b) | Bitwise and.
bitor | bitor(a, b) | Bitwise or.
bitxor | bitxor(a, b) | Bitwise exclusive or.
bitshift | bitshift(a, k) | Shifts bits left (k > 0) or right.
bitget | bitget(a, bit) | One bit (1 is the lowest).

# Cells, structs and functions
cell | cell(r, c) | An empty cell array.
cellfun | cellfun(f, c, 'UniformOutput', false) | Applies f to every item.
arrayfun | arrayfun(f, A) | Applies f to every element.
num2cell | num2cell(A) | Every number in its own cell.
cell2mat | cell2mat(c) | A cell of matrices joined into one.
struct | struct('name', value, …) | A struct.
fieldnames | fieldnames(s) | The fields' names.
rmfield | rmfield(s, 'name') | Without that field.
getfield | getfield(s, 'name') | A field's value.
setfield | setfield(s, 'name', v) | With a field set.
deal | [a, b] = deal(x, y) | Several outputs at once.
feval | feval(f, args…) | Calls a function by handle or name.
func2str | func2str(f) | A function handle as text.
str2func | str2func('@(x) x.^2') | Text to a function handle.
eval | eval(code) | Runs text as code.
evalin | evalin('base', code) | Runs text as code.

# Tables
table | table(a, b, 'VariableNames', {…}) | A table of columns (T(rows, cols), T.name, T{r, c}).
readtable | readtable(file, 'Sheet', s) | A table from CSV, text or Excel (headings from the first row).
writetable | writetable(T, file) | Saves a table (CSV or Excel).
array2table | array2table(A, 'VariableNames', {…}) | A matrix as a table.
table2array | table2array(T) | A table of numbers as a matrix.
cell2table | cell2table(c, 'VariableNames', {…}) | A cell as a table.
table2cell | table2cell(T) | A table as a cell.
struct2table | struct2table(s) | A struct of columns as a table.
table2struct | table2struct(T) | A table as a struct of columns.
height | height(T) | Rows of a table (or of an array).
width | width(T) | Columns of a table (or of an array).
head | head(T, n) | The first n rows (8 by default).
tail | tail(T, n) | The last n rows.
summary | summary(T) | Each column: min, median, max, mean; for text the most common.
addvars | addvars(T, v, 'NewVariableNames', name, 'Before', col) | Adds columns.
removevars | removevars(T, names) | Without those columns.
renamevars | renamevars(T, old, new) | Renames columns.
movevars | movevars(T, names, 'After', col) | Moves columns.
groupsummary | groupsummary(T, group, 'mean', data) | One row per group: its count and each method's result.
join | join(A, B, 'Keys', k) | Adds B's columns to A's rows by matching keys.
innerjoin | innerjoin(A, B) | Only rows whose keys are in both.
outerjoin | outerjoin(A, B) | Every row of both.

# Files
readmatrix | readmatrix(file, 'Sheet', s) | Numbers from CSV, text, Excel (.xlsx, .xls).
writematrix | writematrix(A, file) | Saves numbers (CSV, text or Excel).
readcell | readcell(file) | Every cell of a spreadsheet as a cell array.
writecell | writecell(c, file) | Saves a cell array.
csvread | csvread(file, r0, c0) | Numbers from a CSV (gaps are 0).
csvwrite | csvwrite(file, A) | Saves numbers as CSV.
dlmread | dlmread(file, delim, r0, c0) | Numbers from delimited text.
dlmwrite | dlmwrite(file, A, delim) | Saves numbers as delimited text.
save | save file.mat, save(file, 'a', 'b'), save file.txt -ascii | Saves variables (MATLAB's .mat format).
load | load file.mat, S = load(file), load fisheriris | Loads variables (.mat versions 5 to 7.3, or numbers from text); load fisheriris gives Fisher’s iris flowers (meas, species) to learn from.
fileread | fileread(file) | A file's text.
readlines | readlines(file) | A file's lines as a cell.
writelines | writelines(lines, file) | Saves lines of text.
fopen | fid = fopen(file, 'r' or 'w' or 'a') | Opens a file for reading or writing.
fclose | fclose(fid) | Closes a file (writing it).
fgetl | fgetl(fid) | The next line (−1 at the end).
fgets | fgets(fid) | The next line with its new line.
fscanf | fscanf(fid, '%f') | The numbers left in the file.
feof | feof(fid) | True at the end of the file.
frewind | frewind(fid) | Back to the start.
imread | imread(file) | A picture as rows × columns × 3 (uint8).
imwrite | imwrite(I, file, 'Quality', q) | Saves a picture (PNG, JPEG, BMP).
dir | dir, dir('*.csv'), names = dir | Your Lab files.
ls | ls | Your Lab files.
delete | delete(file) | Deletes a file.
isfile | isfile(file) | True when the file exists.
type | type file | Shows a file's text.
copyfile | copyfile(from, to) | Copies a file.
movefile | movefile(from, to) | Renames a file.
pwd | pwd | Hyperion's folder.
cd | cd | Hyperion's folder.

# Plots
plot | plot(x, y, 'r--o', 'LineWidth', 2) | Lines (and markers).
scatter | scatter(x, y, size, colour, 'filled') | Points.
bar | bar(y), bar(Y, 'stacked') | Bars.
barh | barh(y) | Bars lying down.
stairs | stairs(x, y) | Steps.
stem | stem(x, y) | Stems with dots.
area | area(x, y) | A filled area under a line.
histogram | histogram(x, nbins) | A histogram.
hist | hist(x, nbins) | A histogram (older name).
errorbar | errorbar(x, y, err) | Points with error bars.
pie | pie(x, explode, labels) | A pie chart.
pie3 | pie3(x) | A pie chart.
fill | fill(x, y, 'g') | A filled shape.
patch | patch(x, y, c) | A filled shape (added to the plot).
rectangle | rectangle('Position', [x y w h], 'Curvature', c) | A rectangle (or rounded, or an ellipse).
line | line(x, y) | A line added to the plot.
text | text(x, y, 'words') | Words on the plot.
polarplot | polarplot(theta, rho) | A plot in polar coordinates.
polar | polar(theta, rho) | Polar plot (older name).
polarscatter | polarscatter(theta, rho) | Points in polar coordinates.
boxplot | boxplot(X, 'Labels', {…}) | Box plots: quartiles, whiskers, outliers.
semilogx | semilogx(x, y) | Plot with a log x axis.
semilogy | semilogy(x, y) | Plot with a log y axis.
loglog | loglog(x, y) | Plot with both axes log.
fplot | fplot(@(x) sin(x), [a b]) | Plots a function.
ezplot | ezplot(f, [a b]) | Plots a function (older name).
fimplicit | fimplicit(@(x, y) x.^2 + y.^2 - 1) | The curve where f(x, y) = 0.
ezimplicit | ezimplicit(f) | Implicit curve (older name).
xline | xline(v, 'r--', 'label') | A vertical line across the plot.
yline | yline(v) | A horizontal line across the plot.
quiver | quiver(x, y, u, v) | Arrows.
title | title('text') | The plot's title (x^2, \\alpha work).
xlabel | xlabel('text') | The x axis's name.
ylabel | ylabel('text') | The y axis's name.
zlabel | zlabel('text') | The z axis's name.
legend | legend('a', 'b'), legend show | A legend.
grid | grid on | Grid lines.
hold | hold on, hold off | Keeps plots (or starts afresh).
axis | axis([x0 x1 y0 y1]), axis equal, axis off, axis ij | The axes' limits and look.
xlim | xlim([a b]) | x limits.
ylim | ylim([a b]) | y limits.
zlim | zlim([a b]) | z limits.
xticks | xticks(v) | Where the x ticks go.
yticks | yticks(v) | Where the y ticks go.
zticks | zticks(v) | (Taken, not drawn yet.)
xticklabels | xticklabels({…}) | Names for the x ticks.
yticklabels | yticklabels({…}) | Names for the y ticks.
zticklabels | zticklabels({…}) | (Taken, not drawn yet.)
xtickangle | xtickangle(a) | (Taken, not drawn yet.)
ytickangle | ytickangle(a) | (Taken, not drawn yet.)
ztickangle | ztickangle(a) | (Taken, not drawn yet.)
xtickformat | xtickformat(f) | (Taken, not drawn yet.)
ytickformat | ytickformat(f) | (Taken, not drawn yet.)
ztickformat | ztickformat(f) | (Taken, not drawn yet.)
yyaxis | yyaxis left, yyaxis right | Two y axes on one plot.
subplot | subplot(r, c, k) | Several plots in one figure.
sgtitle | sgtitle('text') | A title over every subplot.
suptitle | suptitle('text') | Same as sgtitle.
figure | figure, figure(n) | A new figure (or figure n).
clf | clf | Clears the figure.
cla | cla | Clears the axes.
close | close, close all | Closes figures.
gcf | gcf | The current figure's number.
gca | gca, set(gca, 'XLim', [0 10]) | The current axes (for set).
set | set(gca, 'XLim', v, 'YLim', v, 'XGrid', 'on') | Changes the current axes' limits and grid.
drawnow | drawnow | Draws now.
rlim | rlim([a b]) | A polar plot's radius limits.

# 3D plots and colour
plot3 | plot3(x, y, z) | Lines in 3D.
scatter3 | scatter3(x, y, z, size, colour) | Points in 3D.
surf | surf(X, Y, Z) | A surface.
surfc | surfc(X, Y, Z) | A surface.
surface | surface(X, Y, Z) | A surface.
mesh | mesh(X, Y, Z) | A wire mesh.
meshc | meshc(X, Y, Z) | A wire mesh.
meshz | meshz(X, Y, Z) | A wire mesh.
waterfall | waterfall(X, Y, Z) | A wire mesh.
contour | contour(X, Y, Z, n), [C, h] = contour(…) | Lines of equal height ('ShowText', 'on' writes levels).
contour3 | contour3(Z) | Lines of equal height.
contourf | contourf(X, Y, Z, n) | Filled bands of equal height.
clabel | clabel(C, h) | Writes the levels on contour lines.
quiver3 | quiver3(x, y, z, u, v, w) | Arrows in 3D.
fsurf | fsurf(@(x, y) …, [a b c d]) | A surface from a formula.
ezsurf | ezsurf(f) | Surface from a formula (older name).
fmesh | fmesh(@(x, y) …) | A mesh from a formula.
ezmesh | ezmesh(f) | Mesh from a formula (older name).
fcontour | fcontour(@(x, y) …) | Contours from a formula.
ezcontour | ezcontour(f) | Contours from a formula (older name).
fplot3 | fplot3(fx, fy, fz, [t0 t1]) | A 3D curve from formulas.
sphere | sphere(n), [X, Y, Z] = sphere(n) | A sphere.
cylinder | cylinder(r, n) | A cylinder (r can be a profile).
ellipsoid | ellipsoid(xc, yc, zc, xr, yr, zr) | An ellipsoid.
view | view(az, el), view(2), view(3) | Turns the 3D view.
rotate3d | rotate3d on | (Turning is done with view here.)
shading | shading flat, shading interp | Faces with or without edges, or smooth.
camlight | camlight, camlight left | A light beside the viewer.
light | light('Position', [x y z]) | A light from a direction.
lightangle | lightangle(az, el) | A light from an angle.
lighting | lighting gouraud | Flat or smooth lighting (or none).
material | material shiny | How faces reflect light (shiny, dull, metal).
colorbar | colorbar | The colour scale beside the plot.
colormap | colormap(name), colormap(M) | The colours for values (lab, viridis, turbo, jet, hot, gray…).
caxis | caxis([lo hi]) | The colour scale's limits.
clim | clim([lo hi]) | The colour scale's limits.
hyperion | hyperion(n) | Hyperion's own colour map (the default).
parula | parula(n) | Opens Hyperion's own map.
viridis | viridis(n) | Viridis colour map.
plasma | plasma(n) | Plasma colour map.
turbo | turbo(n) | Turbo colour map.
jet | jet(n) | Jet colour map.
hot | hot(n) | Black through red and yellow to white.
cool | cool(n) | Cyan to magenta.
gray | gray(n) | Black to white.
grey | grey(n) | Black to white.
bone | bone(n) | Grey with a hint of blue.
copper | copper(n) | Black to copper.
spring | spring(n) | Magenta to yellow.
summer | summer(n) | Green to yellow.
autumn | autumn(n) | Red to yellow.
winter | winter(n) | Blue to green.

# Pictures
image | image(C) | A picture (indexes the colour map, or rows × columns × 3).
imagesc | imagesc(C), imagesc(C, [lo hi]) | A matrix as colours.
pcolor | pcolor(X, Y, C) | A grid of colours.
imshow | imshow(I), imshow(I, [lo hi]) | Shows a picture (grey or colour).
rgb2gray | rgb2gray(I) | A colour picture in grey.
im2double | im2double(I) | Picture values from 0 to 1.
im2uint8 | im2uint8(I) | Picture values 0–255 (uint8).
imresize | imresize(I, scale), imresize(I, [r c]) | A picture at another size.

# Symbolic maths
syms | syms x y | Makes symbols: letters that stay letters, for exact maths (syms x y t).
sym | sym(x) | An exact value: sym('x') a symbol, sym(1/3) the fraction 1/3, sym(pi) pi, sym('a', [1 3]) [a1, a2, a3].
diff | diff(f, x, n) | Derivative of a formula (n-th with n); for numbers, differences between neighbours.
int | int(f, x, a, b) | Integral of a formula: int(f) the formula, int(f, a, b) or int(f, x, a, b) its value from a to b.
solve | solve(eqn, x) | Solves equations exactly when it can: solve(x^2 == 4, x), solve([e1, e2], [x, y]).
subs | subs(f, x, v) | f with x replaced by v (a number, a formula or an array of numbers).
simplify | simplify(f) | The simplest form found: fractions cancelled, sin² + cos² = 1, common factors out.
expand | expand(f) | Multiplies out brackets and powers.
factor | factor(f) | The factors of a polynomial (or the prime factors of a number), as a row.
collect | collect(f, x) | Gathers the terms by powers of x.
simplifyFraction | simplifyFraction(f) | One fraction, with common factors cancelled.
numden | [n, d] = numden(f) | The top and the bottom of f as one fraction.
limit | limit(f, x, a) | The limit as x → a ('left' or 'right' for one side; a can be Inf).
taylor | taylor(f, x, a) | The Taylor polynomial about a ('Order', n: terms below (x − a)^n; 6 by default).
symsum | symsum(f, k, a, b) | The sum of f for k from a to b (b can be a letter or Inf).
vpa | vpa(f, d) | f with its numbers worked out as decimals (d significant figures; double precision, about 16).
latex | latex(f) | The formula as LaTeX text.
pretty | pretty(f) | Shows a formula set as maths.
symvar | symvar(f) | The letters in a formula.
coeffs | coeffs(f, x) | The coefficients of a polynomial, lowest power first ('All': every power, highest first).
sym2poly | sym2poly(f) | A polynomial's coefficients as numbers, highest power first (for polyval, roots).
poly2sym | poly2sym(c, x) | A polynomial from its coefficients.
jacobian | jacobian(F, v) | The matrix of derivatives of each of F by each of v.
hessian | hessian(f, v) | The matrix of second derivatives of f.
lhs | lhs(eqn) | The left side of an equation.
rhs | rhs(eqn) | The right side of an equation.
isolate | isolate(eqn, x) | The equation rewritten as x == ….
isAlways | isAlways(eqn) | True when the equation always holds (checked by simplifying).
matlabFunction | matlabFunction(f) | A function handle that works out f (element by element), its inputs the letters in f.
assume | assume(cond) | Accepted and noted; this Lab doesn’t use assumptions yet.
assumeAlso | assumeAlso(cond) | Accepted and noted, as assume.
nthroot | nthroot(x, n) | The real n-th root.

# Control systems
tf | tf(num, den), tf('s') | A transfer function from its numerator and denominator (highest power first); tf('s') is s itself, so (s + 1)/(s^2 + 2*s + 1) works.
zpk | zpk(zeros, poles, gain) | A transfer function from its zeros, poles and gain.
ss | ss(A, B, C, D) | A system from state-space matrices (one input, one output), shown as its transfer function.
pid | pid(Kp, Ki, Kd, Tf) | A PID controller: Kp + Ki/s + Kd·s/(Tf·s + 1).
feedback | feedback(G, H, sign) | The closed loop G/(1 + G·H) (sign −1, the usual; +1 for positive feedback).
series | series(G, H) | G and H one after the other (G·H).
parallel | parallel(G, H) | G and H side by side (G + H).
minreal | minreal(G) | Cancels poles and zeros that are the same.
pole | pole(G) | The poles (roots of the denominator).
zero | zero(G) | The zeros (roots of the numerator).
tzero | tzero(G) | The zeros (as zero).
dcgain | dcgain(G) | The steady value for a step of 1 (G at s = 0).
isstable | isstable(G) | True when every pole is in the left half-plane.
damp | damp(G) | Each pole's natural frequency and damping.
stepinfo | stepinfo(G) | Rise time, settling time (2 %), overshoot (%), peak and peak time, steady state.
step | step(G), step(G, T), [y, t] = step(G) | The response to a step of 1, drawn or returned.
impulse | impulse(G), [y, t] = impulse(G) | The response to an impulse.
lsim | lsim(G, u, t) | The response to any input u at times t.
bode | bode(G), [mag, phase, w] = bode(G) | Magnitude (dB) and phase (°) against frequency.
margin | margin(G), [Gm, Pm, Wcg, Wcp] = margin(G) | Gain and phase margins and where they are.
nyquist | nyquist(G) | The frequency response drawn in the complex plane, with −1 marked.
rlocus | rlocus(G), [r, K] = rlocus(G) | Where the closed loop's poles go as the gain rises.

# Machine learning
fitcknn | fitcknn(X, Y, 'NumNeighbors', k, 'Standardize', true) | A k-nearest-neighbour classifier: a row's class is the commonest among its k nearest training rows. X has a row per example; Y its labels (numbers or a cell of text). A table and its label column work too: fitcknn(T, 'Species').
fitctree | fitctree(X, Y, 'MaxNumSplits', n, 'MinLeafSize', m) | A decision tree for classes: yes/no questions on one predictor at a time (CutPredictor, CutPoint, Children).
fitcnb | fitcnb(X, Y) | Naive Bayes: each class's predictors as independent bell curves (Mu, Sigma, Prior).
fitcdiscr | fitcdiscr(X, Y) | Linear discriminant analysis: classes as bell-shaped clouds sharing one spread.
fitcsvm | fitcsvm(X, Y, 'KernelFunction', 'rbf', 'KernelScale', 'auto', 'BoxConstraint', C) | A support vector machine separating two classes by the widest gap ('linear', 'rbf' or 'polynomial').
fitcecoc | fitcecoc(X, Y, 'Learners', templateSVM(…)) | Three or more classes from one SVM per pair of classes.
templateSVM | templateSVM('KernelFunction', 'rbf', …) | The settings for fitcecoc's SVMs.
fitcnet | fitcnet(X, Y, 'LayerSizes', [10 10], 'Activations', 'relu', 'Lambda', 0, 'Standardize', true) | A neural network for classes: fully connected hidden layers ('relu', 'tanh', 'sigmoid' or 'none'), trained by L-BFGS (LayerWeights, LayerBiases, TrainingHistory, ConvergenceInfo).
fitrnet | fitrnet(X, y, 'LayerSizes', 10, …) | A neural network that predicts numbers.
fitcensemble | fitcensemble(X, Y, 'Method', 'Bag', 'NumLearningCycles', 100) | Many decision trees voting: 'Bag' (each on a random resample; with NumVariablesToSample, a random forest), 'AdaBoostM1' (two classes) or 'AdaBoostM2' (several, by the SAMME rule), each tree on the rows the others got wrong.
fitrensemble | fitrensemble(X, y, 'Method', 'LSBoost', 'LearnRate', 0.1) | Trees adding up to a number: 'LSBoost' (each small tree fits what is still missed) or 'Bag' (the trees' average).
TreeBagger | TreeBagger(100, X, Y, 'Method', 'classification') | A random forest: trees on random resamples, each split looking at a few random predictors; oobError shows the error as trees are added.
templateTree | templateTree('MaxNumSplits', 1, 'MinLeafSize', 5) | The settings of an ensemble's trees ('Learners', templateTree(…)).
oobError | oobError(B) | A random forest's out-of-bag error after 1, 2, … trees (each row judged by the trees that didn't see it).
oobLoss | oobLoss(ens) | A bagged ensemble's out-of-bag error: an honest estimate without cross-validation.
predictorImportance | predictorImportance(model) | How much each predictor helped a tree or an ensemble of trees (the drop in impurity its splits gave).
fitrtree | fitrtree(X, y) | A decision tree that predicts numbers (each leaf's mean).
fitlm | fitlm(X, y), fitlm(T, 'y ~ x1 + x2') | A linear regression: Coefficients (estimates, standard errors, t and p values), Rsquared, RMSE.
fitglm | fitglm(X, y, 'Distribution', 'binomial') | A generalised linear model: 'normal' (as fitlm) or 'binomial' (logistic regression; predict gives probabilities).
predict | [label, score] = predict(model, X) | What a model says for new rows (labels and each class's score, or numbers).
loss | loss(model, X, Y) | How wrong a model is on rows with known answers: the share misclassified, or the mean squared error.
resubLoss | resubLoss(model) | The loss on the model's own training rows (optimistic: cross-validate for an honest one).
resubPredict | resubPredict(model) | The model's predictions for its own training rows.
crossval | crossval(model, 'KFold', k), crossval(model, 'Holdout', 0.2) | Learns again k times, each time predicting the part it didn't see; every fitc…/fitr… also takes 'KFold', k.
kfoldLoss | kfoldLoss(cvmodel) | The cross-validated loss: an honest estimate of the error on new data.
kfoldPredict | kfoldPredict(cvmodel) | Each row's prediction from the model that didn't see it.
cvpartition | cvpartition(n or Y, 'KFold', k), cvpartition(Y, 'HoldOut', p) | A split of the rows for testing (by class when given labels).
training | training(c, i) | The rows (true/false) a partition trains on in its i-th split.
test | test(c, i) | The rows (true/false) a partition tests on in its i-th split.
confusionmat | [C, order] = confusionmat(Ytrue, Ypred) | Counts of each true class (rows) against each predicted class (columns).
confusionchart | confusionchart(Ytrue, Ypred), confusionchart(C, names) | The confusion matrix drawn, with counts and the share right.
gscatter | gscatter(x, y, groups) | A scatter plot coloured by group, with a legend.
kmeans | [idx, C, sumd, D] = kmeans(X, k, 'Replicates', r) | k clusters by k-means (k-means++ starts; the best of r tries).
dbscan | [idx, core] = dbscan(X, epsilon, minpts) | Clusters of dense rows; -1 marks noise.
pdist | D = pdist(X, 'euclidean') | The distance between every pair of rows, as one row ('euclidean', 'squaredeuclidean', 'seuclidean', 'cityblock', 'chebychev', 'minkowski', 'cosine', 'correlation', 'hamming').
squareform | S = squareform(D) | pdist's list as a square matrix of distances, or the matrix back as the list.
linkage | Z = linkage(X, 'ward'), linkage(D, 'average') | Tree-style clustering: joins the two nearest groups again and again ('single', 'complete', 'average', 'weighted', 'centroid', 'median', 'ward'); each row of Z: the two groups joined and their distance.
cluster | T = cluster(Z, 'MaxClust', k), cluster(Z, 'Cutoff', c, 'Criterion', 'distance') | Cuts the tree into groups: k of them, or below a height (or below an inconsistency, the default for Cutoff).
clusterdata | T = clusterdata(X, 'Linkage', 'ward', 'MaxClust', 3) | pdist, linkage and cluster in one step.
cophenet | [c, d] = cophenet(Z, D) | How faithfully the tree keeps the distances: the correlation between them and the heights where pairs first join.
inconsistent | inconsistent(Z, depth) | Each join's height against the joins just below it: mean, spread, count and the inconsistency coefficient.
dendrogram | [H, T, perm] = dendrogram(Z, 30, 'ColorThreshold', t, 'Labels', names) | Draws the tree: at most 30 leaves (deeper groups shown as one), groups below 70% of the top height in colours.

# Optimisation
fminsearch | [x, fval, flag, output] = fminsearch(fun, x0, options) | The smallest value of a function by the Nelder–Mead simplex (no slopes needed). output.path holds every step, to draw.
fminunc | [x, fval, flag, output] = fminunc(fun, x0, options) | The smallest value by BFGS (a quasi-Newton method using slopes, measured or given with 'SpecifyObjectiveGradient').
fmincon | x = fmincon(fun, x0, A, b, Aeq, beq, lb, ub, nonlcon, options) | The smallest value with limits: A·x ≤ b, Aeq·x = beq, lb ≤ x ≤ ub and nonlcon(x) giving [c, ceq] with c ≤ 0, ceq = 0 (an augmented Lagrangian).
linprog | [x, fval, flag] = linprog(f, A, b, Aeq, beq, lb, ub) | The best of a linear cost f·x under linear limits, by the simplex method (flag −2: impossible; −3: no bottom).
intlinprog | x = intlinprog(f, intcon, A, b, Aeq, beq, lb, ub) | As linprog, with the variables listed in intcon whole numbers (branch and bound).
quadprog | x = quadprog(H, f, A, b, Aeq, beq, lb, ub) | The smallest ½xᵀHx + fᵀx under linear limits.
lsqnonlin | [x, resnorm, residual] = lsqnonlin(fun, x0, lb, ub) | The x making fun(x)'s entries as small as possible (sum of squares), by Levenberg–Marquardt.
lsqcurvefit | p = lsqcurvefit(@(p, x) model, p0, xdata, ydata, lb, ub) | Fits a model's parameters to data by least squares.
fsolve | x = fsolve(fun, x0) | Solves a system F(x) = 0 (as many equations as wanted).
ga | [x, fval] = ga(fun, nvars, A, b, Aeq, beq, lb, ub, nonlcon, options) | A genetic algorithm: a population that breeds and mutates towards the best, for bumpy functions with many dips.
particleswarm | [x, fval] = particleswarm(fun, nvars, lb, ub, options) | A swarm of points pulled towards their own best and the swarm's best.
gamultiobj | [x, fval] = gamultiobj(fun, nvars, A, b, Aeq, beq, lb, ub, nonlcon, options) | Several goals at once (fun gives a row of them): the best trade-offs, the Pareto front, by a genetic algorithm (NSGA-II), each point then polished onto the true front (options HybridFcn 'none' skips that). Bounds are needed. Drawn without outputs.
paretosearch | [x, fval] = paretosearch(fun, nvars, A, b, Aeq, beq, lb, ub, nonlcon, options) | The Pareto front point by point (options ParetoSetSize, 30 by default): each pushed as far as it goes along its own direction from the best values. Drawn without outputs.
lsqnonneg | [x, resnorm, residual, flag, output, lambda] = lsqnonneg(C, d) | C*x as close to d as it can be with every x ≥ 0 (Lawson and Hanson's active set): amounts, concentrations, mixtures that can't go negative.
lsqlin | [x, resnorm, residual, flag, output] = lsqlin(C, d, A, b, Aeq, beq, lb, ub, x0, options) | Least squares C*x ≈ d with linear constraints and bounds.
fminimax | [x, fval, maxfval, flag, output] = fminimax(fun, x0, A, b, Aeq, beq, lb, ub, nonlcon, options) | Makes the largest of several values (fun gives a row) as small as it can: the worst case at its best.
fgoalattain | [x, fval, attainfactor, flag, output] = fgoalattain(fun, x0, goal, weight, A, b, Aeq, beq, lb, ub, nonlcon, options) | Gets each of several values to its goal, every one missing (or beating) it by the same share of its weight; a negative attainfactor means every goal is beaten. Weight 0 makes a goal a hard limit; abs(goal) is the usual weight.
patternsearch | [x, fval, flag, output] = patternsearch(fun, x0, A, b, Aeq, beq, lb, ub, nonlcon, options) | Direct search without slopes: tries a step each way along every axis, doubling the step after a win and halving it after a miss. Options: MeshTolerance (1e-6), PollMethod (GPSPositiveBasis2N, GPSPositiveBasisNp1, GSSPositiveBasis2N/Np1: stops on bounds, MADSPositiveBasis2N/Np1: random directions each poll), UseCompletePoll, SearchFcn 'searchlhs' (a Latin hypercube first), InitialMeshSize, MeshExpansionFactor, MeshContractionFactor, HybridFcn. Works on rough or jumpy functions; constraints through an augmented Lagrangian.
simulannealbnd | [x, fval, flag, output] = simulannealbnd(fun, x0, lb, ub, options) | Simulated annealing: random steps that sometimes go uphill, less often as it cools, so it can climb out of small dips to find a deeper one. Options: InitialTemperature (100), TemperatureFcn ('temperatureexp', 'temperaturefast', 'temperatureboltz' or @(optimValues, options) …), AnnealingFcn ('annealingfast', 'annealingboltz' or @(optimValues, problem) …), ReannealInterval (100: temperatures raised by the gradient), HybridFcn ('fminsearch', 'fminunc', 'fmincon', 'patternsearch'). Random: rng(n) first to repeat a run.
optimset | opts = optimset('Display', 'iter', 'TolX', 1e-8) | Options for the solvers: Display ('off', 'iter', 'final', 'notify'), StepTolerance (TolX), FunctionTolerance (TolFun), OptimalityTolerance, MaxIterations, MaxFunctionEvaluations, PlotFcns (@optimplotfval, @optimplotx), SpecifyObjectiveGradient, PopulationSize, MaxGenerations, SwarmSize, and each solver's own (see patternsearch, simulannealbnd).
optimoptions | opts = optimoptions('fmincon', 'Display', 'iter') | The same as optimset (the solver's name first).

# Predictive maintenance
rms | rms(x) | The root mean square: a signal's typical size (for a matrix, each column's).
peak2peak | peak2peak(x) | The distance from the lowest value to the highest.
peak2rms | peak2rms(x) | The crest factor: the largest size against the RMS (impacts from a failing bearing raise it).
hilbert | z = hilbert(x) | The analytic signal x + i·H{x}: its size abs(z) is the envelope, its angle the phase.
envelope | [up, lo] = envelope(x) | The upper and lower envelopes, from the Hilbert transform.
envspectrum | [p, f] = envspectrum(x, fs) | The spectrum of the envelope: a bearing's damage shows as peaks at its defect frequencies. Without outputs, drawn.
bearingFaultBands | [FB, info] = bearingFaultBands(fr, nb, db, dp, beta) | A bearing's defect frequencies (outer race BPFO, inner race BPFI, cage FTF, ball spin BSF) from the shaft speed (Hz), the number of balls, the ball and pitch diameters and the contact angle; FB is a ±5% band around each.
findchangepts | i = findchangepts(x, 'Statistic', 'mean', 'MaxNumChanges', k, 'MinThreshold', c) | Where a signal changes ('mean', 'rms', 'std' or 'linear'): the k best changes exactly, or every change worth more than c. Without outputs, drawn.
cusum | [iupper, ilower] = cusum(x, climit, mshift, tmean, tdev) | Cumulative sums that catch a small, lasting drift above or below the target mean.
monotonicity | monotonicity(members) | 1 when a feature only rises (or only falls) over each machine's life; members is a cell of vectors or a column each.
trendability | trendability(members) | How alike the members' paths are (the weakest correlation between two).
prognosability | prognosability(members) | How alike the machines' values at failure are, against how far each travelled.
exponentialDegradationModel | mdl = exponentialDegradationModel('Phi', phi) | Wear that grows like phi + θ·e^(βt): fit it to past machines, update it on one, predict its remaining life.
linearDegradationModel | mdl = linearDegradationModel | Wear that grows in a straight line.
fit | mdl = fit(mdl, {[t1 y1], [t2 y2], …}) | Learns a degradation model from past machines' histories ([time value] each, or tables).
update | mdl = update(mdl, [t y]) | The model after seeing one machine's readings so far.
predictRUL | [rul, ci, pdf] = predictRUL(mdl, [t y], threshold) | The remaining useful life: when the level will reach the threshold, a 90% range and the spread of possible times.
modalfrf | [frf, f, coh] = modalfrf(x, y, fs, window, noverlap) | A structure's frequency response from a hammer or shaker test: the H1 estimate (Welch's averages of output against input) and the coherence. Without outputs, drawn.
modalfit | [fn, dr] = modalfit(frf, f, fs, mnum, 'FreqRange', [lo hi]) | The natural frequencies and damping ratios of the mnum tallest peaks (peak picking; damping from the half-power width).
pkurtosis | [sk, f] = pkurtosis(x, fs, window) | The spectral kurtosis: high in the band where a damaged bearing's impacts ring, near 0 for steady noise.
kurtogram | [K, f, w, fc, wc, bw] = kurtogram(x, fs, level) | The spectral kurtosis for windows of 8 to 2^(level+2) samples: the best band's centre fc and width bw, to filter before an envelope spectrum.
tsa | [ta, t, rpm] = tsa(x, fs, tPulse, 'NumRotations', 1) | Time-synchronous averaging: the turns between tachometer pulses stretched alike and averaged, so only what turns with the shaft is left.
orderspectrum | [spec, order] = orderspectrum(x, fs, rpm) | The spectrum against orders (cycles per shaft turn), the signal resampled at even steps of angle so a run-up keeps each order in one place.

# Energy: batteries, solar and wind
batteryCell | c = batteryCell('Capacity', 5, 'R0', 0.012, 'R1', 0.008, 'C1', 2500) | A lithium-ion cell as an equivalent circuit: its open-circuit voltage by state of charge, a series resistance and one RC pair (capacity in Ah, ohms, farads).
batteryPack | p = batteryPack(cell, s, p) | s cells in series and p strings in parallel (voltage × s, capacity × p); NominalVoltage and EnergykWh.
batteryOCV | batteryOCV(soc) | The cell's open-circuit voltage at a state of charge from 0 to 1.
batterySimulate | [v, soc, T] = batterySimulate(b, I, dt, soc0, 'Ambient', 25, 'Temperature', 25, 'Cooling', 0.05) | Runs a cell or pack under a current (A, + discharging) every dt seconds: its voltage and state of charge; with 'Ambient', 'Temperature' or 'Cooling' (W/K) it also warms as it works (its resistance and capacity follow the temperature) and gives its temperature. Drawn without outputs.
socEstimate | soc = socEstimate(battery, I, v, dt, guess) | The state of charge from currents and measured voltages by an extended Kalman filter: it corrects a wrong first guess.
batteryAge | a = batteryAge(b, 'Cycles', 1000, 'DoD', 0.8, 'CRate', 1, 'Temperature', 25, 'Years', 2, 'StorageSOC', 0.5) | How a cell wears: capacity lost to cycling (Wang et al.'s model) and to time (√time, faster when warm or kept full), its state of health, the resistance grown, and the aged cell (a.Cell).
batteryLife | [cycles, years] = batteryLife(b, 'DoD', 0.8, 'CRate', 1, 'Temperature', 25, 'CyclesPerDay', 1, 'EndOfLife', 0.8) | Cycles (and years) until the state of health falls to 80%; drawn without outputs, beside the same use 15 °C cooler and warmer.
pvModule | m = pvModule('Isc', 9, 'Voc', 37.5, 'Ns', 60, 'Rs', 0.25, 'Rsh', 300) | A solar module by the single-diode model (short-circuit current, open-circuit voltage, cells in series, resistances).
pvCurve | [V, I, P, mpp] = pvCurve(module, G, T) | The current and power against voltage at irradiance G (W/m²) and cell temperature T (°C), and the maximum power point. Without outputs, drawn.
windTurbine | w = windTurbine('Diameter', 100, 'RatedPower', 2.5e6, 'CutIn', 3, 'CutOut', 25, 'Cp', 0.45) | A wind turbine (metres, watts, m/s; Cp at most Betz's 0.593).
windPower | windPower(turbine, v) | Its power (W) at each wind speed: ½ρAC_p v³, held at rated, nothing outside cut-in to cut-out.
windAEP | [MWh, cf, meanWind] = windAEP(turbine, k, c) | A year's energy and the capacity factor over Weibull winds (shape k; k = 2 is Rayleigh; scale c in m/s).
sunPosition | [elevation, azimuth] = sunPosition(lat, lon, [y m d], hours, tz) | Where the sun is (degrees above the horizon, and clockwise from north) at local clock hours in time zone tz (hours from UTC), by NOAA's equations.
pvDay | [P, hours, Wh] = pvDay(module, lat, lon, [y m d], 'Tilt', 30, 'Azimuth', 180, 'TimeZone', tz, 'Air', 25) | A module through a clear day: the sun on its tilted face, its cells' temperature and its power every 15 minutes, and the day's energy. Drawn without outputs.
windFarm | f = windFarm(turbine, xy, v, dir, 'Decay', 0.075) | Turbines at rows [x y] (m, x east) with the wind at v m/s from dir degrees: each one's wind and power with the others' wakes (the Jensen model), and the farm's share of its unshaded power. Drawn without outputs.
windFarmAEP | [MWh, loss] = windFarmAEP(turbine, xy, k, c, dirs, shares) | The farm's year over Weibull winds (shape k, scale c) from those directions with those shares, and the share the wakes cost.

# Power systems and mixed-signal
powerflow | r = powerflow(bus, lines, 'TapControl', [line bus target]) | A load flow by Newton–Raphson: buses as rows [type P Q V angle] (3 slack, 2 generator, 1 load; P, Q injections in per unit), lines as rows [from to r x b tap] (tap: a transformer's off-nominal ratio on the from side, 1 if left out). Gives V, AngleDeg, P, Q, LineFlows, Losses, Taps; 'TapControl' moves those transformers' taps in 5/8 % steps until each holds its bus near the target.
shortcircuit | f = shortcircuit(n, lines, sources, k, 'Type', 'LG', 'Zf', 0) | A fault at bus k by symmetrical components: 'Type' '3P' (all three phases), 'LG' (one to ground), 'LL' (two together) or 'LLG' (two to ground); lines [from to r x b x0] (x0 three times x unless given), sources [bus x1 x2 x0] (x0 = Inf: not grounded). Gives FaultCurrent, PhaseCurrents, SequenceCurrents and BusVoltages (each phase's, for an unbalanced fault).
swing | [t, delta, omega] = swing(H, Pm, Pmax, 'During', 0, 'After', Pmax, 'Clear', 0.1, 'Damping', 0, 'Frequency', 50, 'Time', 3) | One generator against a strong grid (the swing equation): its rotor angle (degrees) and speed after a fault cleared at 'Clear' seconds; 'During' and 'After' are the most power the network carries in each. Drawn without outputs, with the critical clearing time.
criticalclearing | [tcr, deltacr] = criticalclearing(H, Pm, Pmax, during, after, f) | The longest a fault can last (seconds) and the angle by which it must be cleared (the equal-area criterion) for the machine to stay in step. Drawn without outputs: the power–angle curves.
transientstability | s = transientstability(bus, lines, gens, k, tc, 'Trip', line, 'Time', 3) | Many generators [bus H xd' D] after a fault at bus k cleared at tc seconds (tripping a line if asked): the classical model on the load flow's starting point, the network reduced to the generators, their rotor angles from the centre of inertia, and whether they stay together. Drawn without outputs.
adc | [codes, xq] = adc(x, bits, [lo hi], 'Offset', 0, 'Gain', 0, 'INL', 0, 'Noise', 0, 'Jitter', 0, 'Fs', fs) | An N-bit converter over [lo hi]: each sample's code and the value it stands for. A real one's flaws as name–value pairs: 'Offset' and 'Noise' in LSB, 'Gain' a share (0.01 = 1 %), 'INL' the spread of each code edge in LSB, 'Jitter' the sampling clock's wobble in seconds (with the sample rate 'Fs').
dac | v = dac(codes, bits, [lo hi]) | A digital-to-analogue converter: codes back to values.
snr | snr(signal, noise) | The signal-to-noise ratio in dB.
pll | [f, err] = pll(fin, fs, n, 'Bandwidth', 50, 'Damping', 0.707) | A phase-locked loop following an input frequency (a number, or one per sample): the oscillator's frequency and the phase error. Without outputs, drawn.
adcmetrics | m = adcmetrics(y, fs) | A converter's sine test from its samples (IEEE 1241, a Blackman–Harris window): SNR, SINAD, THD, SFDR (dB) and ENOB (bits); drawn without outputs as the spectrum.
inldnl | [inl, dnl] = inldnl(codes, bits) | Integral and differential nonlinearity (LSB) of every code from a sine slightly beyond full scale (the code-density test). Drawn without outputs.
sigmadelta | [bits, y] = sigmadelta(x, osr, order) | A sigma-delta modulator (order 1 or 2) on x in −1…1 sampled osr times faster than needed: the 1-bit stream, and the signal back at the slower rate through a sinc filter.

# Wireless communications
pskmod | y = pskmod(symbols, M, phase) | Phase-shift keying: each whole number 0 to M−1 to a point on the unit circle, Gray coded (neighbours differ by one bit).
pskdemod | s = pskdemod(y, M, phase) | Back from PSK points to symbols: the nearest angle.
qammod | y = qammod(symbols, M, 'UnitAveragePower', true) | Square QAM (M = 4, 16, 64, 256…): the points on a grid, Gray coded on each axis; unit average power when asked.
qamdemod | s = qamdemod(y, M, 'UnitAveragePower', true) | Back from QAM points to symbols: the nearest grid point.
awgn | y = awgn(x, snr, 'measured') | Adds white Gaussian noise at an SNR in dB, against the signal's measured power (or 1).
biterr | [n, ratio] = biterr(a, b, k) | The bits that differ between two lists of k-bit symbols, and their share.
symerr | [n, ratio] = symerr(a, b) | The symbols that differ, and their share.
berawgn | ber = berawgn(EbN0dB, 'psk'|'qam', M) | The textbook bit-error rate over white noise at Eb/N0 in dB, to compare a simulation against.
qfunc | q = qfunc(x) | The standard normal's upper tail, Q(x).
int2bit | b = int2bit(x, n) | Whole numbers to n bits each (most significant first), as one column.
bit2int | x = bit2int(b, n) | Bits back to whole numbers, n bits each.
scatterplot | scatterplot(y) | Draws complex points as a constellation: in-phase across, quadrature up.

# Image processing
fspecial | h = fspecial('gaussian', 5, 1) | A ready-made kernel: 'average', 'gaussian', 'disk', 'sobel', 'prewitt', 'laplacian', 'log', 'unsharp'.
imfilter | J = imfilter(I, h, 'replicate', 'conv') | Filters a picture with a kernel (correlation, or 'conv'); the border is 0, a number, 'replicate', 'symmetric' or 'circular'. Colour pictures page by page; uint8 stays uint8.
imgaussfilt | J = imgaussfilt(I, sigma, 'FilterSize', n) | A Gaussian blur (sigma 0.5 unless given).
medfilt2 | J = medfilt2(I, [m n], 'symmetric') | The median of each neighbourhood: takes out salt-and-pepper specks and keeps edges.
imsharpen | J = imsharpen(I, 'Radius', 1, 'Amount', 0.8) | Sharpens by adding back the difference from a blurred copy.
imgradient | [Gmag, Gdir] = imgradient(I) | The gradient's size and direction (degrees) by the Sobel kernel.
imgradientxy | [Gx, Gy] = imgradientxy(I) | The gradient across and down, by the Sobel kernel.
edge | [BW, t] = edge(I, 'canny', [low high], sigma) | Edges as a logical picture: 'sobel' and 'prewitt' (a cut on the gradient, thinned) or 'canny' (smoothing, thinning and two cuts joined by hysteresis).
graythresh | t = graythresh(I) | Otsu's threshold (0 to 1): the cut that best separates dark from light.
imbinarize | BW = imbinarize(I, t) | Black and white: above Otsu's threshold, a given one, or 'adaptive' (each pixel against its neighbourhood; 'Sensitivity' 0 to 1).
strel | se = strel('disk', 3) | A shape for the operations below: 'disk', 'square', 'rectangle', 'diamond', 'line' (length, angle), or a matrix of 1s and 0s.
imerode | J = imerode(I, se) | Erosion: the smallest value under the shape (shrinks white).
imdilate | J = imdilate(I, se) | Dilation: the largest value under the shape (grows white).
imopen | J = imopen(I, se) | Erosion then dilation: takes away bits smaller than the shape.
imclose | J = imclose(I, se) | Dilation then erosion: closes gaps smaller than the shape.
imtophat | J = imtophat(I, se) | The picture less its opening: small bright details (and evens out uneven light).
imbothat | J = imbothat(I, se) | The closing less the picture: small dark details.
bwlabel | [L, n] = bwlabel(BW, 8) | Numbers each group of joined white pixels (4 or 8 neighbours).
bwareaopen | BW2 = bwareaopen(BW, p) | Removes groups of fewer than p pixels.
imfill | BW2 = imfill(BW, 'holes') | Fills holes: black that can't be reached from the edge.
bwperim | P = bwperim(BW) | The outline of each white shape.
regionprops | t = regionprops(BW, 'Area', 'Centroid') | Measures each shape, as a table: Area, Centroid, BoundingBox, MajorAxisLength, MinorAxisLength, Eccentricity, Orientation, EquivDiameter ('basic' or 'all').
label2rgb | RGB = label2rgb(L, 'jet') | Colours each numbered shape for showing; the background white.
imoverlay | RGB = imoverlay(I, BW, [1 0 0]) | The picture with a mask painted on in a colour.
imhist | [counts, x] = imhist(I, n) | The histogram of brightness (256 bins); drawn without outputs.
histeq | J = histeq(I) | Histogram equalisation: spreads the brightness evenly.
imadjust | J = imadjust(I, [low high], [low2 high2], gamma) | Stretches contrast: by default the darkest and brightest 1% to black and white.
stretchlim | lim = stretchlim(I, tol) | The limits imadjust stretches between.
imnoise | J = imnoise(I, 'gaussian', m, v) | Adds noise: 'gaussian' (mean, variance), 'salt & pepper' (share of pixels), 'speckle'. rng repeats it.
imcomplement | J = imcomplement(I) | The negative.
imcrop | J = imcrop(I, [x y width height]) | A rectangle of the picture (x across, y down).
psnr | [p, snr] = psnr(A, ref, peak) | The peak signal-to-noise ratio in dB against a reference.
ssim | [s, map] = ssim(A, ref) | Structural similarity (1 when the same), and its map.
phantom | P = phantom(n) | The Shepp–Logan head, a standard test picture (n × n, 256 unless given).
checkerboard | C = checkerboard(n, p, q) | A checkerboard test picture of n-pixel squares.

# Radar
physconst | c = physconst('LightSpeed') | Physical constants: 'LightSpeed', 'Boltzmann', 'EarthRadius'.
pow2db | db = pow2db(p) | A power ratio in decibels (10 log₁₀).
db2pow | p = db2pow(db) | Decibels back to a power ratio.
mag2db | db = mag2db(a) | An amplitude ratio in decibels (20 log₁₀).
db2mag | a = db2mag(db) | Decibels back to an amplitude ratio.
freq2wavelen | lambda = freq2wavelen(f, c) | The wavelength of a frequency (light's speed unless c is given).
wavelen2freq | f = wavelen2freq(lambda, c) | The frequency of a wavelength.
range2time | t = range2time(r, c) | The round-trip time to a range.
time2range | r = time2range(t, c) | The range of a round-trip time.
speed2dop | fd = speed2dop(v, lambda) | The Doppler shift of a speed (one way: use 2v for a radar's echo).
dop2speed | v = dop2speed(fd, lambda) | The speed of a Doppler shift (one way).
rangeres2bw | B = rangeres2bw(dr, c) | The bandwidth for a range resolution, c / 2Δr.
bw2rangeres | dr = bw2rangeres(B, c) | The range resolution of a bandwidth.
radareqsnr | snr = radareqsnr(lambda, R, Pt, tau, 'Gain', G, 'RCS', rcs, 'Ts', T, 'Loss', L) | The radar equation: one pulse's SNR (dB) from a target at range R (gain 20 dB, RCS 1 m², 290 K, no loss unless given).
radareqrng | R = radareqrng(lambda, snr, Pt, tau, …) | The farthest range that still gives that SNR.
radareqpow | Pt = radareqpow(lambda, R, snr, tau, …) | The peak power needed for that SNR at range R.
chirp | y = chirp(t, f0, t1, f1, 'linear', phi) | A swept cosine from f0 at 0 to f1 at t1: 'linear', 'quadratic' or 'logarithmic'.
lfmpulse | w = lfmpulse(B, T, fs) | A linear-FM (chirp) radar pulse: bandwidth B over T seconds, complex, at sample rate fs.
radarecho | x = radarecho(w, fs, prf, n, fc, [range speed amp], 'SNR', 10) | Echoes of moving targets (one row each; speed + going away) over n pulses: range samples × pulses. 'Clutter', 30 adds ground clutter that much above the noise.
pulsecompress | y = pulsecompress(x, w) | The matched filter: each column correlated with the pulse, a target's peak at its delay.
rangedoppler | [M, range, speed] = rangedoppler(x, w, fs, prf, fc) | The range–Doppler map in dB (pulse compression, then a windowed FFT across pulses). Drawn without outputs.
cfar | [det, th] = cfar(power, guard, train, pfa) | Cell-averaging CFAR: each cell against its neighbours' mean, for a false-alarm rate pfa (down each column).
ambgfun | [A, delay, doppler] = ambgfun(w, fs) | The ambiguity function: how a pulse answers every delay and Doppler shift. Drawn without outputs.
steervec | a = steervec(pos, ang) | Steering vectors: the phase a plane wave from each angle puts on each element (one column per angle). pos in wavelengths: a row (a line along y) or 3 rows [x; y; z]; ang a row of azimuths or 2 rows [az; el] (degrees, 0 = broadside).
sensorsig | [X, R] = sensorsig(pos, ns, ang, noise, 'Power', p) | ns snapshots (rows) of what the elements receive from far sources at those angles in noise of that power; X'*X/ns estimates the covariance, R is the true one.
arraypattern | p = arraypattern(pos, w, az) | The array's response (dB) at each azimuth for weights w (uniform if left out): steer with w = steervec(pos, 30), lower the side lobes with .*hamming(N). Drawn without outputs, with the beam's width.
spatialspectrum | P = spatialspectrum(R, pos, az, 'Method', 'music', 'NumSignals', 2) | Power by direction from a covariance: 'beamscan' (the beam swept across), 'mvdr' (Capon) or 'music' (the noise subspace: sharpest). Drawn without outputs, with its peaks.
musicdoa | doa = musicdoa(R, nsig, 'ScanAngles', az, 'ElementSpacing', 0.5) | The directions (degrees) of nsig signals by MUSIC, for a line of equally spaced elements.
mtifilter | y = mtifilter(x, 2) | Moving-target indication: each pulse less the one before (2) or the two-step difference (3), across the columns; still ground clutter cancels, movers stay.
groupdetections | p = groupdetections(det, power) | One detection per group of neighbouring hits, at the strongest: indices for a vector, rows [row col] for a matrix (a range–Doppler map).
fmcwbeat | x = fmcwbeat(B, T, fs, fc, chirps, [range speed amp], 'SNR', 20) | A car radar's (FMCW) beat signal: each chirp sweeps B Hz in T seconds; samples down, chirps across.
fmcwrangedoppler | [M, range, speed] = fmcwrangedoppler(x, B, T, fs, fc) | The FMCW range–Doppler map in dB (an FFT down each chirp and across the chirps). Drawn without outputs.
trackkalman | X = trackkalman(Z, dt, 'ProcessNoise', q, 'MeasurementNoise', r) | A constant-velocity Kalman filter on measured positions [x y] (NaN rows: missed): rows [x y vx vy]. Drawn without outputs.
trackmulti | t = trackmulti(scans, dt, 'MeasurementNoise', r, 'Gate', 9.21, 'Confirm', 3, 'Drop', 4) | Many targets from a cell array of scans (each rows [x y], false alarms included): tracks gated, paired nearest first, started, confirmed and dropped; a table of the confirmed tracks (Scan, Track, X, Y, VX, VY). Drawn without outputs.
pca | [coeff, score, latent, tsquared, explained, mu] = pca(X) | Principal components: the directions of most spread, the rows in them, and each one's share of the variance.
perfcurve | [fpr, tpr, T, AUC] = perfcurve(labels, scores, positive) | The ROC curve of scores and the area under it.
optimizableVariable | optimizableVariable('x', [lo hi], 'Type', 'integer', 'Transform', 'log') | A setting for bayesopt to search: real, integer or categorical ({'a', 'b'}), on a straight or log scale.
bayesopt | r = bayesopt(@(t) loss(t.x, t.y), [vars], 'MaxObjectiveEvaluations', 30) | Finds the settings with the smallest value by Bayesian optimisation (a Gaussian process and expected improvement): r.XAtMinObjective, r.MinObjective. Every fitc…/fitr… also tunes itself: fitcsvm(X, Y, 'OptimizeHyperparameters', 'auto') tries settings by their 5-fold error ('HyperparameterOptimizationOptions', struct('MaxObjectiveEvaluations', 30, 'Optimizer', 'bayesopt' or 'gridsearch' or 'randomsearch')).

# Running code
help | help name | Help for a function.
doc | doc name | Help for a function.
lookfor | lookfor word | Functions whose help mentions the word.
error | error('message', …) | Stops with a message.
warning | warning('message') | Shows a warning and goes on.
assert | assert(condition, 'message') | Stops when the condition is false.
input | input('prompt') | (Not available in the browser: no keyboard prompt.)
keyboard | keyboard | (Not available here.)
pause | pause(s) | Waits (figures update).
tic | tic | Starts a stopwatch.
toc | toc | Seconds since tic.
clock | clock | [year month day hour minute seconds].
now | now | Today as a day number.
datestr | datestr(now) | A date as text.
clc | clc | Clears the command window.
clear | clear, clear x | Removes variables.
clearvars | clearvars | Removes variables.
who | who | The variables' names.
whos | whos | The variables with sizes and types.
format | format long, format short | How numbers are shown.
more | more off | (Nothing to page here.)
beep | beep | (Silent here.)
ver | ver | Hyperion's version.
version | version | Hyperion's version.
pkg | pkg load | (Every package is already loaded.)
nargin | nargin | How many inputs the function was given.
nargout | nargout | How many outputs were asked for.
exist | exist('name') | 1 a variable, 2 a file, 5 a function, 0 nothing.
`;

export interface Entry { name: string; syntax: string; text: string; section: string }
export const HELP = new Map<string, Entry>();
export const SECTIONS: string[] = [];
{
  let section = '';
  for (const line of TEXT.split('\n')) {
    if (line.startsWith('# ')) { section = line.slice(2); SECTIONS.push(section); continue; }
    const m = /^(\S+) \| (.+?) \| (.+)$/.exec(line);
    if (m) HELP.set(m[1], { name: m[1], syntax: m[2], text: m[3], section });
  }
}
/** The help text for a function, with others of its section to look at. */
export function helpFor(name: string): string | null {
  const e = HELP.get(name);
  if (!e) return null;
  const near = [...HELP.values()].filter((x) => x.section === e.section && x.name !== name).slice(0, 8).map((x) => x.name);
  return `${e.name}  —  ${e.text}\n\n    ${e.syntax}\n\n${e.section}. See also: ${near.join(', ')}.\n`;
}
/** Functions whose name or help mentions the words. */
export function lookFor(words: string): Entry[] {
  const q = words.toLowerCase().split(/\s+/).filter(Boolean);
  return [...HELP.values()].filter((e) => q.every((w) => `${e.name} ${e.text} ${e.section}`.toLowerCase().includes(w)));
}
