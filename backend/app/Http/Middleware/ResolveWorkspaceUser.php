<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class ResolveWorkspaceUser
{
    public function handle(Request $request, Closure $next): Response
    {
        // When a Bearer token is explicitly provided (e.g. mobile clients or token tests),
        // let standard Sanctum guard authenticate the exact token owner.
        if (! $request->bearerToken() && filter_var(env('WORKSPACE_NO_LOGIN', false), FILTER_VALIDATE_BOOLEAN)) {
            $primaryUser = User::query()->orderBy('id')->first();
            if ($primaryUser) {
                Auth::guard('sanctum')->setUser($primaryUser);
                $request->setUserResolver(static fn () => $primaryUser);
            }
        }

        return $next($request);
    }
}
