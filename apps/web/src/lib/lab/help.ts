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
find | find(x), [r, c] = find(A) | Where the true (non-zero) values are.
nnz | nnz(x) | How many non-zero values.
any | any(x, dim) | True when any value is true.
all | all(x, dim) | True when every value is true.
and | and(a, b) | a & b.
or | or(a, b) | a | b.
xor | xor(a, b) | True when exactly one is true.
not | not(a) | ~a.
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
fzero | fzero(f, x0) | Where f is zero, near x0 (or between [a b]).
fminbnd | [x, fx] = fminbnd(f, a, b) | Where f is smallest between a and b.
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
freqz | [h, w] = freqz(b, a, n) | A filter's frequency response.
hann | hann(n) | Hann window.
hanning | hanning(n) | Hann window (older name).
hamming | hamming(n) | Hamming window.
blackman | blackman(n) | Blackman window.
rectwin | rectwin(n) | Rectangular window.

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
pca | [coeff, score, latent, tsquared, explained, mu] = pca(X) | Principal components: the directions of most spread, the rows in them, and each one's share of the variance.
perfcurve | [fpr, tpr, T, AUC] = perfcurve(labels, scores, positive) | The ROC curve of scores and the area under it.

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
