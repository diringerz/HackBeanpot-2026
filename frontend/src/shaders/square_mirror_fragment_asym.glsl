// ============================================================================
// CURVED MIRROR — Asymmetric Extruded Profile Fragment Shader
// ============================================================================
//
// The mirror is a rectangle with a curved cross-section along the Y axis,
// extruded flat along X. The profile can be fully asymmetric — the top half
// of the mirror can have a completely different curve than the bottom half.
//
//   Side view (YZ plane):           Top view (XY plane):
//
//   z ▲                              y ▲
//     │      ╭──╮                      │ ┌──────────┐
//     │     ╱    ╲                     │ │          │
//     │   ╱       ╲                    │ │  mirror  │  ← flat
//     │  ╱         ╲                   │ │          │
//     │ ╱    ← asymmetric!             │ └──────────┘
//     │╱                               └────────────▶ x
//     └──────────────────▶ y
//     -halfH            +halfH
//
// MATH:
//   Surface: z(x,y) = g(y) = a·y² + b·y + c   (per segment, in y-space)
//
//   Ray: y(t) = oy + t·dy  (LINEAR in t)
//
//   Substituting into surface equation:
//     a·(oy+t·dy)² + b·(oy+t·dy) + c + mirrorDist = oz + t·dz
//
//   This is a QUADRATIC in t. No quartic needed. Each segment is a single
//   quadratic formula — the cheapest possible analytical intersection.
//
// Segments span y ∈ [yMin, yMax] covering the full range [-halfH, +halfH].
// Packed as vec4(a, b, c, yMin). yMax = next segment's yMin, or +halfH.
//
// SCENE LAYOUT:
//   Camera at origin, looking +Z.
//   Mirror at z ≈ u_mirrorDist + profile.
//   Image plane (webcam) at z = -u_imagePlaneDist.
//
// ============================================================================

precision highp float;

#define MAX_SEGMENTS 16

// === DEBUG MODE ===
// 0 = normal rendering
// 1 = visualize linear path (red where qA is small)
// 2 = visualize center hits (green where |y| < 0.1)
// 3 = disable linear fallback entirely
// 4 = visualize hitPos.y as color gradient (red=bottom, green=center, blue=top)
// 5 = visualize normal direction (shows normal.y component)
// 6 = visualize qA magnitude (red=small, white=large)
// 7 = visualize hit depth (z position) - closer=brighter
// 8 = visualize image plane X coordinate (see if there's a discontinuity)
// 9 = visualize fallback root usage (YELLOW where fallback root was used)
// 10 = visualize b_coeff value (should be 0 for symmetric curve)
// 11 = visualize screen Y vs hit Y (shows mapping distortion)
#define DEBUG_MODE 0

// --- Uniforms ---

uniform sampler2D u_webcamTex;
uniform vec2  u_resolution;

uniform float u_mirrorDist;
uniform float u_mirrorHalfWidth;   // half-extent along X (flat axis)
uniform float u_mirrorHalfHeight;  // half-extent along Y (profile axis)

// Segment data: vec4(a, b, c, yMin) per segment.
// Each segment defines z(y) = a·y² + b·y + c for y ∈ [yMin, yMax].
// yMax of segment i = yMin of segment i+1.
// yMax of last segment = +u_mirrorHalfHeight.
// yMin of first segment should be -u_mirrorHalfHeight.
uniform vec4  u_segments[MAX_SEGMENTS];
uniform int   u_numSegments;

uniform float u_imagePlaneDist;
uniform vec2  u_imageSize;

uniform float u_fov;

// Distance to background plane (behind camera and webcam feed)
#define BACKGROUND_PLANE_DIST 5.0

// ============================================================================
// BACKGROUND PLANE GRADIENT
// ============================================================================

vec3 getBackgroundColor(vec3 hitPoint) {
    // Create a gradient based on position on the background plane
    // Use Y and X coordinates to create an interesting gradient
    
    // Normalize coordinates to create smooth gradients
    float x = hitPoint.x * 0.15;
    float y = hitPoint.y * 0.15;
    
    // Create a multi-color gradient
    vec3 color1 = vec3(0.1, 0.05, 0.2);  // Deep purple
    vec3 color2 = vec3(0.05, 0.15, 0.3); // Deep blue
    vec3 color3 = vec3(0.15, 0.08, 0.25); // Purple-pink
    
    // Mix based on position
    float mixFactor1 = sin(x * 1.5) * 0.5 + 0.5;
    float mixFactor2 = cos(y * 1.5) * 0.5 + 0.5;
    
    vec3 mixedColor = mix(
        mix(color1, color2, mixFactor1),
        color3,
        mixFactor2
    );
    
    // Add some radial falloff from center
    float dist = length(vec2(x, y));
    float vignette = 1.0 - smoothstep(0.0, 3.0, dist);
    mixedColor *= (0.5 + 0.5 * vignette);
    
    return mixedColor;
}

// ============================================================================
// PER-SEGMENT INTERSECTION — Quadratic
// ============================================================================
//
// Surface: z = a·y² + b·y + c + mirrorDist
// Ray: P(t) = O + t·D, so y(t) = oy + t·dy, z(t) = oz + t·dz
//
// Setting equal:
//   a·(oy + t·dy)² + b·(oy + t·dy) + c + mirrorDist = oz + t·dz
//
// Expand:
//   a·dy²·t² + (2a·oy·dy + b·dy)·t + (a·oy² + b·oy + c + mirrorDist) = oz + t·dz
//
// Rearrange:
//   (a·dy²)·t² + (2a·oy·dy + b·dy - dz)·t + (a·oy² + b·oy + c + mirrorDist - oz) = 0
//    ^^^^^^       ^^^^^^^^^^^^^^^^^^^^^^^^^     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//      qA                   qB                                  qC

// Global variables to track debug info
bool g_usedLinearPath = false;
bool g_usedFallbackRoot = false;

float intersectSegment(
    float a, float b_coeff, float c_coeff,
    float yMin, float yMax,
    vec3 ro, vec3 rd
) {
    float qA = a * rd.y * rd.y;
    float qB = 2.0 * a * ro.y * rd.y + b_coeff * rd.y - rd.z;
    float qC = a * ro.y * ro.y + b_coeff * ro.y + c_coeff + u_mirrorDist - ro.z;

    float t = -1.0;

    #if DEBUG_MODE == 3
    // Force quadratic path (disable linear fallback)
    if (false && abs(qA) < 1e-10) {
    #else
    if (abs(qA) < 1e-10) {
    #endif
        // Linear: qB·t + qC = 0
        g_usedLinearPath = true;
        if (abs(qB) < 1e-10) return -1.0;
        t = -qC / qB;
        if (t < 0.001) return -1.0;

        // CRITICAL FIX: Validate Y bounds for linear case
        float hitY_linear = ro.y + rd.y * t;
        if (hitY_linear < yMin || hitY_linear > yMax) return -1.0;
    } else {
        g_usedLinearPath = false;
    float disc = qB * qB - 4.0 * qA * qC;
    if (disc < 0.0) return -1.0;

    float sq = sqrt(disc);

    // Numerical stability fix: use numerically stable quadratic formula
    // when qA is small to avoid division by near-zero values
    float t1, t2;
    if (abs(qA) < 1e-6) {
        // qA is small but not tiny - use more stable formula
        // For small qA, use: t ≈ -qC/qB (first order) with correction
        float t_linear = -qC / qB;
        // The two roots are approximately t_linear and very large
        t1 = t_linear;
        t2 = -2.0 * qC / (qB + sign(qB) * sq); // More stable second root
    } else {
        // Normal case
        t1 = (-qB - sq) / (2.0 * qA);
        t2 = (-qB + sq) / (2.0 * qA);
    }

        // Pick smallest positive root
    float tMin = min(t1, t2);
    float tMax = max(t1, t2);
        t = (tMin > 0.001) ? tMin : ((tMax > 0.001) ? tMax : -1.0);
    }

    if (t < 0.0) return -1.0;

    // Validate: y at hit must be within this segment's domain
    float hitY = ro.y + rd.y * t;
    if (hitY < yMin || hitY > yMax) {
        // First root was out of domain — try the other root
        g_usedFallbackRoot = true;
        float disc = qB * qB - 4.0 * qA * qC;
        if (disc < 0.0 || abs(qA) < 1e-10) return -1.0;
        float sq = sqrt(disc);
        float t1 = (-qB - sq) / (2.0 * qA);
        float t2 = (-qB + sq) / (2.0 * qA);
        // Try the other root
        float tOther = (t == min(t1, t2)) ? max(t1, t2) : min(t1, t2);
        if (tOther < 0.001) return -1.0;
        float hitY2 = ro.y + rd.y * tOther;
        if (hitY2 < yMin || hitY2 > yMax) return -1.0;
        t = tOther;
    } else {
        g_usedFallbackRoot = false;
    }

    return t;
}


// ============================================================================
// SURFACE NORMAL
// ============================================================================
//
// z(x,y) = a·y² + b·y + c + mirrorDist
//
//   dz/dx = 0           (flat along X)
//   dz/dy = 2a·y + b    (profile derivative)
//
// Surface: F(x,y,z) = z - a·y² - b·y - c - mirrorDist = 0
// ∇F = (0, -(2a·y + b), 1)
// Negate to face camera → (0, 2a·y + b, -1)

vec3 computeNormal(float hitY, float a, float b_coeff) {
    float dzdy = 2.0 * a * hitY + b_coeff;

    // Robustness fix: if hitY is very close to 0 for a symmetric curve,
    // force the normal to be exactly (0, 0, -1) to avoid floating-point
    // errors causing discontinuities at the mirror center
    if (abs(hitY) < 1e-5 && abs(b_coeff) < 1e-6) {
        return vec3(0.0, 0.0, -1.0);
    }

    // Also clamp dzdy if it's very small
    if (abs(dzdy) < 1e-6) {
        dzdy = 0.0;
    }

    return normalize(vec3(0.0, dzdy, -1.0));
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

    // --- Test all segments, keep nearest hit ---
    float bestT = 1e20;
    int   bestSeg = -1;

    for (int i = 0; i < MAX_SEGMENTS; i++) {
        if (i >= u_numSegments) break;

        vec4 seg = u_segments[i];
        float a       = seg.x;
        float b_coeff = seg.y;
        float c_coeff = seg.z;
        float yMin    = seg.w;

        // yMax: next segment's yMin, or +halfHeight for last segment
        float yMax;
        if (i + 1 < u_numSegments) {
            yMax = u_segments[i + 1].w;
        } else {
            yMax = u_mirrorHalfHeight;
        }

        float t = intersectSegment(a, b_coeff, c_coeff,
                                   yMin, yMax, ro, rd);

        if (t > 0.0 && t < bestT) {
            vec3 p = ro + rd * t;
            // Validate rectangular bounds (X is the flat axis)
            if (abs(p.x) <= u_mirrorHalfWidth) {
                bestT = t;
                bestSeg = i;
            }
        }
    }

    // --- No hit ---
    if (bestSeg < 0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    vec3 hitPos = ro + rd * bestT;

    // === DEBUG VISUALIZATIONS ===
    #if DEBUG_MODE == 1
    // Test 1: Visualize linear path usage (RED)
    if (g_usedLinearPath) {
        gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
        return;
    }
    #endif

    #if DEBUG_MODE == 2
    // Test 2: Visualize center hits (GREEN for |y| < 0.1)
    if (abs(hitPos.y) < 0.01) {
        gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0);
        return;
    }
    #endif

    #if DEBUG_MODE == 9
    // Test 9: Visualize fallback root usage (YELLOW)
    if (g_usedFallbackRoot) {
        gl_FragColor = vec4(1.0, 1.0, 0.0, 1.0);
        return;
    }
    #endif

    #if DEBUG_MODE == 11
    // Test 11: Visualize screen Y vs world hit Y
    // Show difference to see distortion
    vec2 ndc = (gl_FragCoord.xy / u_resolution) * 2.0 - 1.0;
    float screenY = ndc.y;
    float worldY = hitPos.y;

    // Normalize world Y to [-1, 1] range
    float worldYNorm = worldY / u_mirrorHalfHeight;

    // Visualize the difference
    float diff = abs(screenY - worldYNorm);
    gl_FragColor = vec4(diff, 1.0 - diff, 0.0, 1.0); // More yellow = more distortion
    return;
    #endif

    #if DEBUG_MODE == 4
    // Test 4: Visualize hitPos.y as gradient
    // Map y from [-mirrorHalfHeight, +mirrorHalfHeight] to color
    float yNorm = (hitPos.y + u_mirrorHalfHeight) / (2.0 * u_mirrorHalfHeight); // 0 to 1
    gl_FragColor = vec4(1.0 - yNorm, abs(yNorm - 0.5) * 2.0, yNorm, 1.0);
    return;
    #endif

    #if DEBUG_MODE == 6
    // Test 6: Visualize qA magnitude to see where it's small
    // Need to recalculate it here
    vec4 seg = u_segments[bestSeg];
    float a = seg.x;
    float qA_vis = a * rd.y * rd.y;
    float qA_mag = abs(qA_vis) * 10000.0; // Scale for visibility
    qA_mag = clamp(qA_mag, 0.0, 1.0);
    gl_FragColor = vec4(1.0 - qA_mag, qA_mag, 0.0, 1.0); // Red=small, green=large
    return;
    #endif

    // --- Retrieve winning segment coefficients ---
    float segA = 0.0;
    float segB = 0.0;
    for (int i = 0; i < MAX_SEGMENTS; i++) {
        if (i == bestSeg) {
            segA = u_segments[i].x;
            segB = u_segments[i].y;
            break;
        }
    }

    #if DEBUG_MODE == 10
    // Test 10: Visualize b_coeff (should be 0 for symmetric curve)
    float bMag = abs(segB) * 1000.0; // Scale for visibility
    bMag = clamp(bMag, 0.0, 1.0);
    if (abs(segB) < 0.0001) {
        gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0); // GREEN if near zero
    } else if (segB > 0.0) {
        gl_FragColor = vec4(0.0, 0.0, bMag, 1.0); // BLUE if positive
    } else {
        gl_FragColor = vec4(bMag, 0.0, 0.0, 1.0); // RED if negative
    }
    return;
    #endif

    // --- Normal ---
    vec3 N = computeNormal(hitPos.y, segA, segB);

    #if DEBUG_MODE == 5
    // Test 5: Visualize normal direction
    // Show normal.y component (should be 0 at center for symmetric curve)
    float normalY = N.y;
    vec3 normalColor = vec3(
        normalY < 0.0 ? -normalY : 0.0,  // Red for negative
        abs(normalY),                     // Green for magnitude
        normalY > 0.0 ? normalY : 0.0     // Blue for positive
    );
    gl_FragColor = vec4(normalColor, 1.0);
    return;
    #endif

    // --- Reflect ---
    vec3 reflDir = reflect(rd, N);

    if (reflDir.z >= 0.0) {
        gl_FragColor = vec4(0.03, 0.03, 0.05, 1.0);
        return;
    }

    // --- Intersect with image plane at z = -u_imagePlaneDist ---
    float tImg = (-u_imagePlaneDist - hitPos.z) / reflDir.z;
    vec3 imgHit = hitPos + reflDir * tImg;

    #if DEBUG_MODE == 7
    // Test 7: Visualize hit depth (z position)
    // Normalize z relative to mirror distance
    float zNorm = (hitPos.z - (u_mirrorDist - 0.5)) / 1.0; // Adjust range as needed
    zNorm = clamp(zNorm, 0.0, 1.0);
    gl_FragColor = vec4(vec3(zNorm), 1.0); // Brighter = closer to camera
    return;
    #endif

    vec2 imgUV = imgHit.xy / u_imageSize + 0.5;
    imgUV.x = 1.0 - imgUV.x;
    imgUV.y = 1.0 - imgUV.y;  // Flip Y to match webcam texture orientation

    #if DEBUG_MODE == 8
    // Test 8: Visualize image plane X coordinate
    // Show imgHit.x as color to see if there's a discontinuity
    float xNorm = (imgHit.x / u_imageSize.x) + 0.5;
    gl_FragColor = vec4(xNorm, 1.0 - xNorm, 0.5, 1.0);
    return;
    #endif

    if (imgUV.x < 0.0 || imgUV.x > 1.0 || imgUV.y < 0.0 || imgUV.y > 1.0) {
        // Ray missed the camera feed - check if it hits the background plane
        // Background plane is at z = -u_imagePlaneDist - BACKGROUND_PLANE_DIST
        float backPlaneZ = -u_imagePlaneDist - BACKGROUND_PLANE_DIST;
        
        // Calculate intersection with background plane
        if (reflDir.z < 0.0) {
            float tBack = (backPlaneZ - hitPos.z) / reflDir.z;
            if (tBack > 0.0) {
                vec3 backHit = hitPos + reflDir * tBack;
                vec3 bgColor = getBackgroundColor(backHit);
                gl_FragColor = vec4(bgColor, 1.0);
                return;
            }
        }
        
        // If we don't hit the background plane, return dark color
        gl_FragColor = vec4(0.02, 0.02, 0.03, 1.0);
        return;
    }

    vec4 texColor = texture2D(u_webcamTex, imgUV);

    // Edge fade along rectangle boundary
    float edgeX = abs(hitPos.x) / u_mirrorHalfWidth;
    float edgeY = abs(hitPos.y) / u_mirrorHalfHeight;
    float edgeFade = smoothstep(1.0, 0.92, max(edgeX, edgeY));

    // Fresnel
    float fresnel = 0.85 + 0.15 * pow(1.0 - abs(dot(normalize(-rd), N)), 2.0);

    gl_FragColor = vec4(texColor.rgb * edgeFade * fresnel, 1.0);
}
