// ============================================================================
// CURVED MIRROR — Analytical Ray-Traced Fragment Shader
// ============================================================================
//
// APPROACH: Closed-form ray–surface intersection (NO ray marching).
//
// The mirror is a surface of revolution whose profile is a polynomial in r²:
//
//   z(r) = a₂·r⁴ + a₁·r² + a₀       (quadratic in r²)
//
// where r² = x² + y². Substituting the ray parametric equation yields a
// quartic polynomial in t, solvable analytically via Ferrari's method.
//
// This is orders of magnitude faster than ray marching:
//   - Ray march: 64–256 texture lookups per pixel, iterative
//   - Analytical: ~1 quartic solve per pixel, deterministic
//
// SCENE LAYOUT:
//   Camera at origin, looking +Z.
//   Mirror surface at z ≈ u_mirrorDist (displaced by profile).
//   Image plane (webcam) at z = -u_imagePlaneDist (behind camera).
//
// USER CONTROLS:
//   The 3 profile coefficients (a₂, a₁, a₀) can be driven by:
//   - Direct sliders
//   - 3 control points fitted to the polynomial
//   - Bézier-to-polynomial conversion
//
// ============================================================================

precision highp float;

// --- Uniforms ---

uniform sampler2D u_webcamTex;
uniform vec2  u_resolution;

// Mirror profile: z(r) = u_profileCoeffs.x * r⁴ + u_profileCoeffs.y * r² + u_profileCoeffs.z
// This is relative to the mirror base plane, so actual surface z = u_mirrorDist + z(r)
uniform vec3  u_profileCoeffs;    // (a2, a1, a0) — coefficients for r⁴, r², constant

uniform float u_mirrorDist;       // base distance from camera to mirror
uniform float u_mirrorRadius;     // max radial extent of mirror

// Image plane
uniform float u_imagePlaneDist;   // distance behind camera (positive)
uniform vec2  u_imageSize;        // world-space size of image plane

// Camera
uniform float u_fov;              // vertical FOV in radians


// ============================================================================
// QUARTIC SOLVER — Ferrari's method
// ============================================================================
//
// Solves: c4·t⁴ + c3·t³ + c2·t² + c1·t + c0 = 0
// Returns the smallest positive real root, or -1.0 if none exists.
//
// We first reduce to a depressed quartic, then use Ferrari's resolvent cubic
// to factor it into two quadratics.
// ============================================================================

// --- Cubic solver (needed by Ferrari) ---
// Finds one real root of: t³ + p·t + q = 0 (depressed cubic)
float solveCubicDepressed(float p, float q) {
    float disc = q * q / 4.0 + p * p * p / 27.0;

    if (disc >= 0.0) {
        // One real root via Cardano
        float sqrtDisc = sqrt(disc);
        float u = -q / 2.0 + sqrtDisc;
        float v = -q / 2.0 - sqrtDisc;
        return sign(u) * pow(abs(u), 1.0 / 3.0) + sign(v) * pow(abs(v), 1.0 / 3.0);
    } else {
        // Three real roots — use trigonometric method, return any one
        float m = sqrt(-4.0 * p / 3.0);
        float theta = acos(3.0 * q / (p * m)) / 3.0;
        return m * cos(theta);
    }
}

// --- Quartic solver ---
// Solves c[4]·t⁴ + c[3]·t³ + c[2]·t² + c[1]·t + c[0] = 0
// Returns smallest positive real root, or -1 if none.
float solveQuartic(float c0, float c1, float c2, float c3, float c4) {
    // Handle degenerate cases
    if (abs(c4) < 1e-10) {
        // Degenerate to cubic or lower — solve quadratic fallback
        if (abs(c3) < 1e-10) {
            // Quadratic
            if (abs(c2) < 1e-10) return -1.0;
            float disc = c1 * c1 - 4.0 * c2 * c0;
            if (disc < 0.0) return -1.0;
            float sq = sqrt(disc);
            float t1 = (-c1 - sq) / (2.0 * c2);
            float t2 = (-c1 + sq) / (2.0 * c2);
            float tMin = min(t1, t2);
            float tMax = max(t1, t2);
            if (tMin > 0.001) return tMin;
            if (tMax > 0.001) return tMax;
            return -1.0;
        }
        // For cubic, fall through to quartic with c4 ≈ 0 handled by normalization
        return -1.0;
    }

    // Normalize: t⁴ + b·t³ + c·t² + d·t + e = 0
    float b = c3 / c4;
    float c = c2 / c4;
    float d = c1 / c4;
    float e = c0 / c4;

    // Depressed quartic via substitution t = u - b/4:
    // u⁴ + p·u² + q·u + r = 0
    float b2 = b * b;
    float b3 = b2 * b;
    float b4 = b2 * b2;

    float p = c - 3.0 * b2 / 8.0;
    float q = d - b * c / 2.0 + b3 / 8.0;
    float r = e - b * d / 4.0 + b2 * c / 16.0 - 3.0 * b4 / 256.0;

    // If q ≈ 0, it's a biquadratic: u⁴ + p·u² + r = 0
    if (abs(q) < 1e-10) {
        float disc = p * p - 4.0 * r;
        if (disc < 0.0) return -1.0;
        float sq = sqrt(disc);
        float s1 = (-p + sq) / 2.0;
        float s2 = (-p - sq) / 2.0;

        float bestT = 1e20;
        if (s1 >= 0.0) {
            float u = sqrt(s1);
            float t1 = u - b / 4.0;
            float t2 = -u - b / 4.0;
            if (t1 > 0.001 && t1 < bestT) bestT = t1;
            if (t2 > 0.001 && t2 < bestT) bestT = t2;
        }
        if (s2 >= 0.0) {
            float u = sqrt(s2);
            float t1 = u - b / 4.0;
            float t2 = -u - b / 4.0;
            if (t1 > 0.001 && t1 < bestT) bestT = t1;
            if (t2 > 0.001 && t2 < bestT) bestT = t2;
        }
        return bestT < 1e19 ? bestT : -1.0;
    }

    // Ferrari's resolvent cubic: m³ + (p/2)·m² + ((p²-4r)/16)·m - q²/64 = 0
    // Substitute to depressed form and solve for one real root
    float rp = p / 2.0;
    float rq = (p * p - 4.0 * r) / 16.0;
    float rr = -q * q / 64.0;

    // Depressed: m³ + αm + β = 0 where α = rq - rp²/3, β = rr - rp·rq/3 + 2rp³/27
    float rp2 = rp * rp;
    float alpha = rq - rp2 / 3.0;
    float beta  = rr - rp * rq / 3.0 + 2.0 * rp2 * rp / 27.0;

    float m = solveCubicDepressed(alpha, beta) - rp / 3.0;

    // Factor depressed quartic into two quadratics using m:
    // (u² + m)² = (2m + p)·u² - q·u + (m² + r)  ... should be perfect square
    // → (u² + m) = ±(√(2m+p) · u - q/(2√(2m+p)))

    float sq2mp = 2.0 * m + p;
    if (sq2mp < 0.0) sq2mp = 0.0; // numerical safety
    float w = sqrt(sq2mp);

    float bestT = 1e20;

    if (w > 1e-12) {
        // Two quadratics: u² ± w·u + (m ± q/(2w)) = 0
        float qOver2w = q / (2.0 * w);

        // Quadratic 1: u² + w·u + (m + qOver2w) = 0
        float disc1 = w * w - 4.0 * (m + qOver2w);
        if (disc1 >= 0.0) {
            float sq1 = sqrt(disc1);
            float u1 = (-w + sq1) / 2.0;
            float u2 = (-w - sq1) / 2.0;
            float t1 = u1 - b / 4.0;
            float t2 = u2 - b / 4.0;
            if (t1 > 0.001 && t1 < bestT) bestT = t1;
            if (t2 > 0.001 && t2 < bestT) bestT = t2;
        }

        // Quadratic 2: u² - w·u + (m - qOver2w) = 0
        float disc2 = w * w - 4.0 * (m - qOver2w);
        if (disc2 >= 0.0) {
            float sq2 = sqrt(disc2);
            float u1 = (w + sq2) / 2.0;
            float u2 = (w - sq2) / 2.0;
            float t1 = u1 - b / 4.0;
            float t2 = u2 - b / 4.0;
            if (t1 > 0.001 && t1 < bestT) bestT = t1;
            if (t2 > 0.001 && t2 < bestT) bestT = t2;
        }
    }

    return bestT < 1e19 ? bestT : -1.0;
}


// ============================================================================
// QUADRATIC FAST PATH
// ============================================================================
// When a2 ≈ 0, the surface is a simple paraboloid: z = a1·r² + a0
// Ray intersection is a quadratic — much cheaper than the full quartic.

float solveQuadraticFastPath(vec3 ro, vec3 rd, float a1, float a0) {
    // Surface: z = a1*(x²+y²) + a0 + u_mirrorDist
    // Ray: p = ro + t*rd
    // ro.z + t*rd.z = a1*((ro.x+t*rd.x)² + (ro.y+t*rd.y)²) + a0 + u_mirrorDist
    //
    // Let A = rd.x²+rd.y², B = 2(ro.x*rd.x + ro.y*rd.y), C = ro.x²+ro.y²
    // r²(t) = A*t² + B*t + C
    //
    // a1*(A*t² + B*t + C) + a0 + u_mirrorDist = ro.z + t*rd.z
    // a1*A*t² + (a1*B - rd.z)*t + (a1*C + a0 + u_mirrorDist - ro.z) = 0

    float A = rd.x*rd.x + rd.y*rd.y;
    float B = 2.0*(ro.x*rd.x + ro.y*rd.y);
    float C = ro.x*ro.x + ro.y*ro.y;

    float qa = a1 * A;
    float qb = a1 * B - rd.z;
    float qc = a1 * C + a0 + u_mirrorDist - ro.z;

    float disc = qb*qb - 4.0*qa*qc;
    if (disc < 0.0) return -1.0;

    float sq = sqrt(disc);
    float t1 = (-qb - sq) / (2.0 * qa);
    float t2 = (-qb + sq) / (2.0 * qa);

    float tMin = min(t1, t2);
    float tMax = max(t1, t2);
    if (tMin > 0.001) return tMin;
    if (tMax > 0.001) return tMax;
    return -1.0;
}


// ============================================================================
// ANALYTICAL SURFACE NORMAL
// ============================================================================
// For z(x,y) = a2*(x²+y²)² + a1*(x²+y²) + a0
// ∂z/∂x = 4·a2·(x²+y²)·x + 2·a1·x = x·(4·a2·r² + 2·a1)
// ∂z/∂y = 4·a2·(x²+y²)·y + 2·a1·y = y·(4·a2·r² + 2·a1)
//
// Normal = normalize(-∂z/∂x, -∂z/∂y, 1)
// (pointing toward camera, i.e. -Z direction after negation)

vec3 surfaceNormal(vec3 hitPos, float a2, float a1) {
    float r2 = hitPos.x * hitPos.x + hitPos.y * hitPos.y;
    float dCoeff = 4.0 * a2 * r2 + 2.0 * a1;

    float dzdx = hitPos.x * dCoeff;
    float dzdy = hitPos.y * dCoeff;

    // Normal of surface F(x,y,z) = z - z(x,y) = 0 is (−dz/dx, −dz/dy, 1)
    // We want it to point toward camera (negative Z)
    vec3 normal = normalize(vec3(-dzdx, -dzdy, 1.0));
    
    // Ensure normal points toward camera (negative Z component)
    if (normal.z > 0.0) {
        normal = -normal;
    }
    
    return normal;
}


// ============================================================================
// MAIN
// ============================================================================

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec2 ndc = uv * 2.0 - 1.0;

    float aspect = u_resolution.x / u_resolution.y;
    ndc.x *= aspect;

    // Camera ray
    float fovScale = tan(u_fov * 0.5);
    vec3 ro = vec3(0.0);
    vec3 rd = normalize(vec3(ndc * fovScale, 1.0));

    float a2 = u_profileCoeffs.x;  // r⁴ coefficient
    float a1 = u_profileCoeffs.y;  // r² coefficient
    float a0 = u_profileCoeffs.z;  // constant offset

    // --- Ray–surface intersection ---
    // Surface: z = a2*r⁴ + a1*r² + a0 + u_mirrorDist
    // where r² = x² + y²
    //
    // Let s(t) = r²(t) = A·t² + B·t + C  (quadratic in t)
    //   A = dx² + dy²
    //   B = 2(ox·dx + oy·dy)
    //   C = ox² + oy²
    //
    // Surface equation along ray:
    //   a2·s² + a1·s + a0 + u_mirrorDist = oz + t·dz
    //
    // Expanding s² = A²t⁴ + 2ABt³ + (2AC+B²)t² + 2BCt + C²:
    //
    // a2·A²·t⁴
    // + (2·a2·A·B)·t³
    // + (a2·(2AC+B²) + a1·A)·t²
    // + (2·a2·B·C + a1·B − dz)·t
    // + (a2·C² + a1·C + a0 + u_mirrorDist − oz)
    // = 0

    float A = rd.x*rd.x + rd.y*rd.y;
    float B = 2.0*(ro.x*rd.x + ro.y*rd.y);
    float C = ro.x*ro.x + ro.y*ro.y;

    float t;

    if (abs(a2) < 1e-8) {
        // Fast path: paraboloid (quadratic intersection)
        t = solveQuadraticFastPath(ro, rd, a1, a0);
    } else {
        // Full quartic
        float c4 = a2 * A * A;
        float c3 = 2.0 * a2 * A * B;
        float c2 = a2 * (2.0*A*C + B*B) + a1 * A;
        float c1 = 2.0 * a2 * B * C + a1 * B - rd.z;
        float c0 = a2 * C * C + a1 * C + a0 + u_mirrorDist - ro.z;

        t = solveQuartic(c0, c1, c2, c3, c4);
    }

    if (t < 0.0) {
        // Miss — background
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    vec3 hitPos = ro + rd * t;

    // Check if hit is within mirror radius
    float hitR = length(hitPos.xy);
    if (hitR > u_mirrorRadius) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    // --- Surface normal (analytical) ---
    vec3 N = surfaceNormal(hitPos, a2, a1);

    // --- Reflect ---
    vec3 reflDir = reflect(rd, N);

    // Reflected ray must head back toward image plane (−Z)
    if (reflDir.z >= 0.0) {
        gl_FragColor = vec4(0.03, 0.03, 0.05, 1.0);
        return;
    }

    // --- Intersect with image plane at z = −u_imagePlaneDist ---
    float tImg = (-u_imagePlaneDist - hitPos.z) / reflDir.z;
    vec3 imgHit = hitPos + reflDir * tImg;

    // World → UV
    vec2 imgUV = imgHit.xy / u_imageSize + 0.5;
    imgUV.x = 1.0 - imgUV.x; // mirror flip X
    imgUV.y = 1.0 - imgUV.y; // flip Y to correct orientation

    if (imgUV.x < 0.0 || imgUV.x > 1.0 || imgUV.y < 0.0 || imgUV.y > 1.0) {
        gl_FragColor = vec4(0.02, 0.02, 0.03, 1.0);
        return;
    }

    vec4 texColor = texture2D(u_webcamTex, imgUV);

    // Edge fade + Fresnel
    float r = hitR / u_mirrorRadius;
    float edgeFade = smoothstep(1.0, 0.92, r);
    float fresnel = 0.85 + 0.15 * pow(1.0 - abs(dot(normalize(-rd), N)), 2.0);

    gl_FragColor = vec4(texColor.rgb * edgeFade * fresnel, 1.0);
}
