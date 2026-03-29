import { useGetMe, useLogin, useLogout, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";

export function useAuth() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data, isLoading, error } = useGetMe({
    query: {
      retry: false,
    }
  });

  const loginMutation = useLogin({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        setLocation("/");
      }
    }
  });

  const logoutMutation = useLogout({
    mutation: {
      onSuccess: () => {
        queryClient.setQueryData(getGetMeQueryKey(), { authenticated: false });
        setLocation("/login");
      }
    }
  });

  return {
    isAuthenticated: data?.authenticated ?? false,
    isLoading,
    error,
    login: loginMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    loginError: loginMutation.error,
    logout: logoutMutation.mutateAsync,
  };
}
